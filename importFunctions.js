const db = require('./db')
const sequelize = require('./db')
const { Op, Transaction, Sequelize } = require('sequelize')
const { convertToBase, convertToUnit, createAudit } = require('./routes/ingredients')
const { authenticateTokenAndAdmin } = require('./routes/authToken')
const Supplier = db.models.Supplier
const Ingredient = db.models.Ingredient
const IngredientCategory = db.models.IngredientCategory
const IngredientLog = db.models.IngredientLog
const IngredientLogGroup = db.models.IngredientLogGroup
const IngredientBatch = db.models.IngredientBatch
const Product = db.models.Product
const ProductLog = db.models.ProductLog
const ProductBatch = db.models.ProductBatch
const ProductLogGroup = db.models.ProductLogGroup
const ProductCategory = db.models.ProductCategory
const Location = db.models.Location
const Notification = db.models.Notification
const LogAudit = db.models.LogAudit
const User = db.models.User
const Brand = db.models.Brand
const ProductTemplate = db.models.ProductTemplate
const ProductTemplateIngredient = db.models.ProductTemplateIngredient
const fs = require('fs')
const path = require('path')
const converter = require('json-2-csv')
const multer = require('multer')
const { DateTime } = require('luxon')
const upload = multer({ dest: 'uploads/' })
const csv = require('csvtojson')

const postIngredientLogs = async (logs, userSocket, io) => {
    try {
        let progress = 0
        let count = 0
        for(const req of logs) {
            count += 1
            const inOut = req.body.inOut
            const qty = convertToBase(req.body.unit, req.body.qty)
            const ingredient = await Ingredient.findOne({
                where: {
                    id: req.body.ingredientId
                },
                attributes: {
                    include: [[sequelize.fn('COALESCE', Sequelize.literal(`(SELECT SUM(qty) FROM IngredientBatches WHERE IngredientBatches.ingredientId = Ingredient.id)`), 0), 'qtySum']]
                },
                include: [
                    {
                        model: IngredientBatch,
                        required: false,
                        attributes: []
                    }
                ],
                raw: true,
                
            })
    
            const logGroup = await IngredientLogGroup.create({
                ingredientId: ingredient.id,
                inProduct: req.body.inProduct || null,
                user: req.user.id,
                inout: inOut,
                unit: req.body.unit,
                remark: req.body.remark || null,
                ed: req.body.ed,
                createdAt: req.body.createdAt || null
            }, {  })
    
            if (inOut === 'in') {
                const batch = await IngredientBatch.findOne({
                    where: {
                        ingredientId: req.body.ingredientId,
                        batchNo: req.body.batchNo
                    },
                    raw: true,
                })
    
                const log = await IngredientLog.create({
                    logGroup: logGroup.id,
                    batchNo: req.body.batchNo,
                    qty: qty,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    location: req.body.location,
                    unit: ingredient.unit,
                    createdAt: req.body.createdAt || null
                }, {  })
    
                await createAudit({ ...req.body, qty: qty, ingredientLogId: log.id, user: req.user.id, ingredientId: ingredient.id }, 'create', )
    
                if(batch) {
                    await IngredientBatch.update({
                        qty: Sequelize.literal(`qty + ${qty}`)
                    }, {
                        where: {
                            id: batch.id
                        }
                    })
                } else {
                    await IngredientBatch.create({
                        batchNo: req.body.batchNo,
                        ingredientId: ingredient.id,
                        logId: log.id,
                        expDate: req.body.expDate,
                        poDate: req.body.poDate,
                        qty: qty,
                        location: req.body.location,
                        createdAt: req.body.createdAt || null
                    }, {  })
                }
    
                if (ingredient.qtySum + qty > ingredient.stockAlert && ingredient.alertDismissed) {
                    await Ingredient.update({ alertDismissed: false }, {
                        where: {
                            id: req.body.ingredientId
                        },
                    })
                }
    
            } else {
                for(const index in req.body.batchList) {
                    const currBatch = req.body.batchList[index]
                    const currQty = convertToBase(req.body.unit, currBatch.qty)
                    let batch = await IngredientBatch.findOne({
                        where: {
                            ingredientId: ingredient.id,
                            batchNo: req.body.batchNo
                        },
                        attributes: ['batchNo', 'qty', 'location', 'id'],
                        raw: true
                    })
                    if(!batch) {
                        const newBatch = await IngredientBatch.create({
                            ingredientId: ingredient.id,
                            logId: null,
                            batchNo: req.body.batchNo,
                            expDate: req.body.expDate || null,
                            poDate: req.body.poDate || null,
                            qty: 0,
                            location: req.body.location
                        })
                        console.log("new batch:",newBatch.dataValues)
                        batch = newBatch.dataValues
                    }
    
                    const batchNo = batch.batchNo
                    let deleted = false
                    let flagged = false
                    if (batch.qty - currQty === 0) {
                        await IngredientBatch.destroy({
                            where: {
                                id: batch.id
                            }
                        }, {  })
                        deleted = true
                    } else {
                        await IngredientBatch.update({
                            qty: Sequelize.literal(`qty - ${currQty}`)
                        }, {
                            where: {
                                id: batch.id
                            },
                        })

                        if(batch.qty - currQty < 0) {
                            flagged = true
                        }
                    }
                    const log = await IngredientLog.create({
                        logGroup: logGroup.id,
                        batchNo: batchNo,
                        qty: currQty,
                        batchQty: batch.qty,
                        expDate: req.body.expDate,
                        poDate: req.body.poDate,
                        location: batch.location,
                        unit: ingredient.unit,
                        batchDeleted: deleted,
                        createdAt: req.body.createdAt || null,
                        flagged: flagged
                    })
    
                    await createAudit({
                        ...req.body,
                        qty: currQty,
                        ingredientLogId: log.id,
                        prevQty: batch.qty,
                        batchNo: batchNo,
                        user: req.user.id,
                        ingredientId: ingredient.id,
                        createdAt: req.body.createdAt || null
                    }, 'create', )
                }
            }
            if(count % 100 === 0) {
                progress += 100
            } else if(count === logs.length - 1) {
                progress += count % 100
            }
            io.to(userSocket.id).emit('posting', { progress: progress, total: logs.length })
        }
        return Promise.resolve()
    } catch (err) {
        console.error("postLog error:",err)
        return Promise.reject()
    }
}

const postProductLogs = async (logs, userSocket, io) => {
    try {
        let progress = 0
        let count = 0
        for(const req of logs) {
            count += 1
            const product = await Product.findOne({
                where: {
                    id: req.body.productId
                },
                attributes: {
                    include: [[Sequelize.literal(`(SELECT SUM(qty) FROM ProductBatches WHERE ProductBatches.productId = Product.id)`), 'qty']]
                },
                include: [
                    {
                        model: ProductBatch,
                        required: false,
                        attributes: []
                    }
                ],
                raw: true
            })
    
            const logGroup = await ProductLogGroup.create({
                productId: product.id,
                user: req.user.id,
                inout: req.body.inOut,
                ed: req.body.ed,
                remark: req.body.remark || null,
                createdAt: req.body.createdAt
            })
    
            if (req.body.inOut === 'in') {
                const log = await ProductLog.create({
                    logGroup: logGroup.dataValues.id,
                    batchNo: req.body.batchNo,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    qty: req.body.qty,
                    location: req.body.location.id,
                    createdAt: req.body.createdAt
                })
    
                await createAudit({ 
                    ...req.body, 
                    qty: req.body.qty, 
                    productLogId: log.dataValues.id, 
                    user: req.user.id, 
                    productId: product.id
                }, 'create')
    
                await ProductBatch.create({
                    batchNo: req.body.batchNo,
                    productId: req.body.productId,
                    expDate: req.body.expDate,
                    poDate: req.body.poDate,
                    qty: req.body.qty,
                    location: req.body.location.id
                })
            } else {
                for(const index in req.body.batchList) {
                    const currBatch = req.body.batchList[index]
                    const currQty = currBatch.qty
                    let batch = await ProductBatch.findOne({
                        where: {
                            productId: product.id,
                            batchNo: req.body.batchNo
                        },
                        attributes: ['batchNo', 'qty', 'location', 'id'],
                        raw: true
                    })
                    if(!batch) {
                        const newBatch = await ProductBatch.create({
                            productId: product.id,
                            logId: null,
                            batchNo: req.body.batchNo,
                            expDate: req.body.expDate || null,
                            poDate: req.body.poDate || null,
                            qty: 0,
                            location: req.body.location
                        })
                        console.log("new batch:",newBatch.dataValues)
                        batch = newBatch.dataValues
                    }
    
                    const batchNo = batch.batchNo
                    let deleted = false
                    let flagged = false
                    if (batch.qty - currQty === 0) {
                        await ProductBatch.destroy({
                            where: {
                                id: batch.id
                            }
                        }, {  })
                        deleted = true
                    } else {
                        await ProductBatch.update({
                            qty: Sequelize.literal(`qty - ${currQty}`)
                        }, {
                            where: {
                                id: batch.id
                            },
                        })

                        if(batch.qty - currQty < 0) {
                            flagged = true
                        }
                    }
                    const log = await ProductLog.create({
                        logGroup: logGroup.id,
                        batchNo: batchNo,
                        qty: currQty,
                        batchQty: batch.qty,
                        expDate: req.body.expDate,
                        poDate: req.body.poDate,
                        location: batch.location,
                        batchDeleted: deleted,
                        createdAt: req.body.createdAt
                    })
    
                    await createAudit({
                        ...req.body,
                        qty: currQty,
                        productLogId: log.id,
                        prevQty: batch.qty,
                        batchNo: batchNo,
                        user: req.user.id,
                        productId: product.id
                    }, 'create')
                }
            }
            if(count % 100 === 0) {
                progress += 100
            } else if(count === logs.length - 1) {
                progress += count % 100
            }
            io.to(userSocket.id).emit('posting', { progress: progress, total: logs.length })
        }
        return Promise.resolve()
    } catch (err) {
        console.error(err)
        return Promise.reject()
    }
}

const processIngredientLogs = async (logs, userSocket, io) => {
    try {
        const sortedLogs = logs.sort((a, b) => new Date(a.date) - new Date(b.date))
        const logList = []
        let progress = 0
        let count = 0

        for(const log of sortedLogs) {
            count += 1
            const ingredient = await Ingredient.findOne({
                where: {
                    code: log.ingredientCode
                },
                raw: true
            })

            if(!ingredient) {
                return Promise.reject({ type: "IngredientNotFoundError", metadata: { ingredient: log.ingredient, code: log.ingredientCode } })
            }
            const batchNo = String(log.batchNo).trim()
            const qty = Math.abs(log.qty)
    
            let location = null
            if(log.location) {
                res = await Location.findOne({
                    where: {
                        name: log.location
                    },
                    attributes: ['id'],
                    raw: true
                })

                if(res) {
                    location = res.id
                }
            }

            const body = {
                ingredientId: ingredient.id,
                inProduct: null,
                ed: null,
                inOut: log.inout.toLowerCase(),
                batchNo: batchNo,
                unit: 'kg',
                remark: log.remark,
                createdAt: log.date,
                qty: qty,
                expDate: log.expDate || null,
                poDate: log.poDate || null,
                location: location
            }
    
            if(log.inout === 'out') {
                body.force = true
                body.batchList = [
                    { id: null, qty: qty }
                ]
            } else {
                // const batch = await IngredientBatch.findOne({
                //     where: {
                //         ingredientId: ingredient.id,
                //         batchNo: batchNo
                //     },
                //     raw: true
                // })

                // if(batch) {
                //     return Promise.reject({ type: 'DuplicateBatchError', metadata: { ingredient: ingredient.code, batchNo: batch.batchNo } })
                // }
            }

            let user = await User.findOne({
                where: {
                    firstName: log.user.split(' ')[0],
                    lastName: log.user.split(' ')[1]
                },
                attributes: ['id'],
                raw: true
            })


            if(!user) {
                user = await User.findOne({
                    where: {
                        id: Number(log.userId)
                    },
                    attributes: ['id'],
                    raw: true
                })

                if(!user) {
                    user = await User.findOne({
                        attributes: ['id'],
                        raw: true
                    })
                }
            }

            logList.push({
                body: body,
                user: {
                    id: user.id
                }
            })
            if(userSocket) {
                if(count % 100 === 0) {
                    progress += 100
                } else if(count === sortedLogs.length - 1) {
                    progress += count % 100
                }
                io.to(userSocket.id).emit('processing', { progress: progress, total: sortedLogs.length })
            }
        }

        await postIngredientLogs(logList, userSocket, io)
        return Promise.resolve()
    } catch(err) {
        console.error(err)
        return Promise.reject()
    }
}

const processProductLogs = async (logs, userSocket, io) => {
    try {
        const sortedLogs = logs.sort((a, b) => new Date(a.date) - new Date(b.date))
        const logList = []
        let progress = 0
        let count = 0
        for(const log of sortedLogs) {
            count += 1
            const product = await Product.findOne({
                where: {
                    code: log.productCode
                },
                raw: true
            })

            if(!product) {
                return Promise.reject({ type: "ProductNotFoundError", metadata: { product: log.product, code: log.productCode } })
            }
            const batchNo = String(log.batchNo).trim()
            const qty = Math.abs(log.qty)
    
            let location = null
            if(log.location) {
                res = await Location.findOne({
                    where: {
                        name: log.location
                    },
                    attributes: ['id'],
                    raw: true
                })

                location = res.id
            }

            const body = {
                productId: product.id,
                ed: null,
                inOut: log.inout.toLowerCase(),
                batchNo: batchNo,
                remark: log.remark,
                createdAt: log.date,
                qty: qty,
                expDate: log.expDate || null,
                poDate: log.poDate || null,
                location: location
            }
    
            if(log.inout === 'out') {
                body.force = true
                body.batchList = [
                    { id: null, qty: qty }
                ]
            } else {
                const batch = await ProductBatch.findOne({
                    where: {
                        productId: product.id,
                        batchNo: String(log.batchNo).trim()
                    },
                    raw: true
                })

                if(batch) {
                    return Promise.reject({ type: 'DuplicateBatchError', metadata: { product: product.code, batchNo: batch.batchNo } })
                }
            }

            let user = await User.findOne({
                where: {
                    firstName: log.user.split(' ')[0],
                    lastName: log.user.split(' ')[1]
                },
                attributes: ['id'],
                raw: true
            })


            if(!user) {
                if(log.userId !== 'undefined' && log.userId !== null) {
                    user = await User.findOne({
                        where: {
                            id: Number(log.userId)
                        },
                        attributes: ['id'],
                        raw: true
                    })
                }

                if(!user) {
                    user = await User.findOne({
                        attributes: ['id'],
                        raw: true
                    })
                }
            }

            logList.push({
                body: body,
                user: {
                    id: user.id
                }
            })
            if(userSocket) {
                if(count % 100 === 0) {
                    progress += 100
                } else if(count === sortedLogs.length - 1) {
                    progress += count % 100
                }
                io.to(userSocket.id).emit('processing', { progress: progress, total: sortedLogs.length })
            }
        }
        await postProductLogs(logList, userSocket, io)
        return Promise.resolve()
    } catch(err) {
        console.error("processProductLogsError: ", err)
        return Promise.reject(err)
    }
}

const postIngredients = async (data, userSocket, io) => {
    try {
        const newIngs = []
        let progress = 0
        let count = 0
        for (const ing of data) {
            count += 1
            const existingCode = await Ingredient.findOne({
                where: {
                    code: String(ing.code).trim()
                },
                raw: true
            })

            const existingName = await Ingredient.findOne({
                where: {
                    name: ing.name
                },
                raw: true
            })

            if(existingCode || existingName) {
                continue
            }

            let category = await IngredientCategory.findOne({
                where: {
                    name: ing.category
                },
                raw: true
            })

            if(!category) {
                return Promise.reject({ type: "IngredientCategoryNotFound", metadata: { ingredient: ing.name, category: ing.category } })
            }

            const supplier = await Supplier.findOne({
                where: {
                    name: ing.supplier
                },
                attributes: ['id'],
                raw: true
            })
            
            newIngs.push({
                code: String(ing.code).trim(),
                name: ing.name,
                category: category.id,
                supplier: supplier ? supplier.id : null,
                stockAlert: convertToBase(ing.unit, ing.stockAlert),
                unit: ing.unit,
                ed: ing.ed,
                receiver: ing.receiver,
                expirationTime: Number(ing.expirationTime)
            })
            if(userSocket) {
                if(count % 100 === 0) {
                    progress += 100
                } else if(count === data.length - 1) {
                    progress += count % 100
                }
                io.to(userSocket.id).emit('processing', { progress: progress, total: data.length })
            }
        }
        await Ingredient.bulkCreate(newIngs)

        return Promise.resolve()
    } catch (err) {
        console.error(err)
        return Promise.reject()
    }
}

const postProducts = async (data, userSocket, io) => {
    try {
        const newProds = []
        for (const prod of data) {
            const existingCode = await Product.findOne({
                where: {
                    code: String(prod.code).trim()
                },
                raw: true
            })

            const existingName = await Product.findOne({
                where: {
                    name: prod.name
                },
                raw: true
            })

            if(existingCode || existingName) {
                continue
            }

            let category = await ProductCategory.findOne({
                where: {
                    name: prod.category
                },
                attributes: ['id'],
                raw: true
            })

            if(!category) {
                return Promise.reject({ type: "ProductCategoryNotFound", metadata: { product: prod.name, category: prod.category } })
            }

            let brand = await Brand.findOne({
                where: {
                    name: prod.brand
                },
                attributes: ['id'],
                raw: true
            })

            if(!brand) {
                return Promise.reject({ type: "ProductBrandNotFound", metadata: { product: prod.name, brand: prod.brand } })
            }
    
            newProds.push({
                code: String(prod.code).trim(),
                name: prod.name,
                category: category.id,
                brand: brand.id,
                expirationTime: Number(prod.expirationTime)
            })

            if(userSocket) {
                if(count % 100 === 0) {
                    progress += 100
                } else if(count === data.length - 1) {
                    progress += count % 100
                }
                io.to(userSocket.id).emit('processing', { progress: progress, total: data.length })
            }
        }
        await Product.bulkCreate(newProds)

        return Promise.resolve()
    } catch (err) {
        console.error(err)
        return Promise.reject()
    }
}

module.exports = {
    processIngredientLogs,
    processProductLogs,
    postIngredients,
    postProducts
}

// const processLogs = async (logs) => {
//     for(const log of logs) {
//         try {
//             const ingredient = await Ingredient.findOne({
//                 where: {
//                     name: log['Product'].trim()
//                 },
//                 raw: true
//             })
//             const batchNo = String(log['Batch No']).trim()
//             const qty = Math.abs(log['Qty'])

//             if(!ingredient) {
//                 let code = batchNo
//                 let existingCode = Ingredient.findOne({
//                     where: {
//                         code: batchNo
//                     },
//                     raw: true
//                 })
//                 while(existingCode) {
//                     code += 'A'
//                     existingCode = Ingredient.findOne({
//                         where: {
//                             code: code
//                         },
//                         raw: true
//                     })
//                 }
//                 await Ingredient.create({
//                     code: code,
//                     name: log['Product'].trim(),
//                     category: 1,
//                     supplier: null,
//                     stockAlert: 0,
//                     unit: 'kg',
//                     ed: null,
//                     reciever: null
//                 })
//             }
    
//             const body = {
//                 ingredientId: ingredient.id,
//                 inProduct: null,
//                 ed: null,
//                 inOut: log['In/Out'].toLowerCase(),
//                 batchNo: batchNo,
//                 unit: 'kg',
//                 remark: log['Remark'],
//                 createdAt: log['Load In Date'],
//                 qty: qty,
//                 expDate: log['Exp Date'] || null,
//                 poDate: log['PO Date'] || null,
//                 location: null
//             }
    
//             if(log['In/Out'] === 'Out') {
//                 body.force = true
//                 const batch = await IngredientBatch.findOne({
//                     where: {
//                         ingredientId: ingredient.id,
//                         batchNo: String(log['Batch No']).trim()
//                     },
//                     raw: true
//                 })
    
//                 if(batch) {
//                     body.batchList = [
//                         { id: batch.id, qty: qty }
//                     ]
//                 } else {
//                     const newBatch = await IngredientBatch.create({
//                         batchNo: String(log['Batch No']).trim(),
//                         ingredientId: ingredient.id,
//                         expDate: log['Exp Date'] || null,
//                         poDate: log['PO Date'] || null,
//                         qty: 0,
//                         location: null
//                     })
    
//                     body.batchList = [
//                         { id: newBatch.id, qty: qty }
//                     ]
//                 }
//             }

//             await postLog({
//                 body: body,
//                 user: {
//                     id: defaultUser.id
//                 }
//             })
//         } catch (err) {
//             console.error(err)
//             return false
//         }
//     }
//     return true
// }