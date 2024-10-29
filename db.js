const { Sequelize, DataTypes } = require('sequelize')

const hostName = process.env.DB
const username = process.env.DB_USER
const password = process.env.DB_PASSWORD

console.log(hostName)

const sequelize = new Sequelize('uventory', username, password, {
    host: hostName,
    dialect: 'mysql'
})

const Product = require('./models/Product')(sequelize, DataTypes)
const ProductBatch = require('./models/ProductBatch')(sequelize, DataTypes)
const ProductLogGroup = require('./models/ProductLogGroup')(sequelize, DataTypes)
const ProductLog = require('./models/ProductLog')(sequelize, DataTypes)
const Location = require('./models/Location')(sequelize, DataTypes)
const User = require('./models/User')(sequelize, DataTypes)
const Ingredient = require('./models/Ingredient')(sequelize, DataTypes)
const IngredientCategory = require('./models/IngredientCategory')(sequelize, DataTypes)
const IngredientBatch = require('./models/IngredientBatch')(sequelize, DataTypes)
const IngredientLogGroup = require('./models/IngredientLogGroup')(sequelize, DataTypes)
const IngredientLog = require('./models/IngredientLog')(sequelize, DataTypes)
const Supplier = require('./models/Supplier')(sequelize, DataTypes)
const Brand = require('./models/Brand')(sequelize, DataTypes)
const RefreshToken = require('./models/RefreshToken')(sequelize, DataTypes)
const Notification = require('./models/Notification')(sequelize, DataTypes)
const Ed = require('./models/Ed')(sequelize, DataTypes)
const ProductTemplate = require('./models/ProductTemplate')(sequelize, DataTypes)
const ProductTemplateIngredient = require('./models/ProductTemplateIngredient')(sequelize, DataTypes)

Ingredient.belongsTo(Supplier, { foreignKey: 'supplier' });
Ingredient.belongsTo(IngredientCategory, { foreignKey: 'category' })
Ingredient.belongsTo(Ed, { foreignKey: 'ed' })
Ingredient.hasMany(IngredientBatch, { foreignKey: 'ingredientId' })
Ingredient.hasOne(User, { foreignKey: 'reservedIngredient' })
User.belongsTo(Ingredient, { foreignKey: 'reservedIngredient' })
IngredientBatch.belongsTo(Ingredient, { foreignKey: 'ingredientId' })
IngredientBatch.belongsTo(Location, { foreignKey: 'location' })
IngredientBatch.belongsTo(IngredientLog, { foreignKey: 'logId' })
IngredientLog.belongsTo(IngredientLogGroup, { foreignKey: 'logGroup' })
IngredientLogGroup.belongsTo(Ingredient, { foreignKey: 'ingredientId' })
IngredientLogGroup.belongsTo(Product, { foreignKey: 'inProduct' })
IngredientLogGroup.belongsTo(User, { foreignKey: 'user' })
IngredientLogGroup.belongsTo(Location, { foreignKey: 'location' })
IngredientLogGroup.hasMany(IngredientLog, { foreignKey: 'logGroup' })
Product.belongsTo(Brand, { foreignKey: 'brand' })
ProductBatch.belongsTo(Product, { foreignKey: 'productId' });
ProductBatch.belongsTo(Location, { foreignKey: 'location' })
ProductLog.belongsTo(ProductLogGroup, { foreignKey: 'logGroup' })
ProductLogGroup.belongsTo(Product, { foreignKey: 'productId' })
ProductLogGroup.belongsTo(User, { foreignKey: 'user' })
ProductLogGroup.belongsTo(Location, { foreignKey: 'location' })
ProductLogGroup.belongsTo(Ed, { foreignKey: 'ed' })
ProductLogGroup.hasMany(ProductLog, { foreignKey: 'logGroup' })
Notification.belongsTo(Ingredient, { foreignKey: 'ingredientId' })
Notification.belongsTo(IngredientBatch, { foreignKey: 'batchId' })
Notification.belongsTo(User, { foreignKey: 'user' })
ProductTemplate.belongsTo(Product, { foreignKey: 'productId' })
ProductTemplateIngredient.belongsTo(ProductTemplate, { foreignKey: 'templateId' })
ProductTemplate.hasMany(ProductTemplateIngredient, { foreignKey: 'templateId' })
ProductTemplateIngredient.belongsTo(Ingredient, { foreignKey: 'ingredientId' })

sequelize.authenticate()
    .then(() => console.log("Database connected"))
    .catch(err => console.error(err))

module.exports = sequelize