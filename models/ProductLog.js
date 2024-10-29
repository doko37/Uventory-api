module.exports = (sequelize, DataTypes) => {
    const ProductLog = sequelize.define('ProductLog', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
            unique: true,
        },
        logGroup: {
            type: DataTypes.UUID,
            references: {
                model: 'ProductLogGroups',
                key: 'id'
            }
        },
        batchNo: {
            type: DataTypes.STRING(255)
        },
        expDate: {
            type: DataTypes.DATE
        },
        poDate: {
            type: DataTypes.DATE
        },
        qty: {
            type: DataTypes.INTEGER
        },
        batchDeleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    })

    return ProductLog
}