const { Sequelize, DataTypes } = require('sequelize')

const hostName = process.env.NODE_ENV === 'production' ? process.env.DB : 'localhost'
const username = process.env.NODE_ENV === 'production' ? 'admin' : 'root'
const password = process.env.NOVE_ENV === 'production' ? process.env.DB_PASSWORD : 'admin'

console.log(hostName)

const sequelize = new Sequelize('test', username, password, {
    host: hostName,
    dialect: 'mysql'
})

// const IngredientBatchIngredientLog = require('./models/IngredientBatchIngredientLog')(sequelize, DataTypes)
// const IngredientLogProductBatch = require('./models/IngredientLogProductBatch')(sequelize, DataTypes)
// const ProductIngredient = require('./models/ProductIngredient')(sequelize, DataTypes)
const Product = require('./models/Product')(sequelize, DataTypes)
const ProductBatch = require('./models/ProductBatch')(sequelize, DataTypes)
const ProductLog = require('./models/ProductLog')(sequelize, DataTypes)
const Location = require('./models/Location')(sequelize, DataTypes)
const User = require('./models/User')(sequelize, DataTypes)
const Ingredient = require('./models/Ingredient')(sequelize, DataTypes)
const IngredientCategory = require('./models/IngredientCategory')(sequelize, DataTypes)
const IngredientBatch = require('./models/IngredientBatch')(sequelize, DataTypes)
const IngredientLog = require('./models/IngredientLog')(sequelize, DataTypes)
const Supplier = require('./models/Supplier')(sequelize, DataTypes)
const Brand = require('./models/Brand')(sequelize, DataTypes)
const RefreshToken = require('./models/RefreshToken')(sequelize, DataTypes)

Ingredient.belongsTo(Supplier, { foreignKey: 'supplier' });
Ingredient.belongsTo(IngredientCategory, { foreignKey: 'category' })
Ingredient.hasMany(IngredientBatch, { foreignKey: 'ingredientId' })
IngredientBatch.belongsTo(Ingredient, { foreignKey: 'ingredientId' });
IngredientBatch.belongsTo(Location, { foreignKey: 'location' })
IngredientLog.belongsTo(Ingredient, { foreignKey: 'ingredientId' });
IngredientLog.belongsTo(Location, { foreignKey: 'location' })
IngredientLog.belongsTo(Product, { foreignKey: 'inProduct' })
IngredientLog.belongsTo(User, { foreignKey: 'user' })
Product.belongsTo(Brand, { foreignKey: 'brand' })
ProductBatch.belongsTo(Product, { foreignKey: 'productId' });
ProductBatch.belongsTo(Location, { foreignKey: 'location' })
ProductLog.belongsTo(Product, { foreignKey: 'productId' })
ProductLog.belongsTo(User, { foreignKey: 'user' })
ProductLog.belongsTo(Location, { foreignKey: 'location' })

sequelize.authenticate()
    .then(() => console.log("Database connected"))
    .catch(err => console.error(err))

module.exports = sequelize