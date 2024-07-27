const { Sequelize, DataTypes } = require('sequelize')

const sequelize = new Sequelize('test', 'root', 'admin', {
    host: 'localhost',
    dialect: 'mysql'
})

// const Ingredient = require('./models/Ingredient')(sequelize, DataTypes)
// const IngredientBatch = require('./models/IngredientBatch')(sequelize, DataTypes)
// const IngredientLog = require('./models/IngredientLog')(sequelize, DataTypes)
// const IngredientBatchIngredientLog = require('./models/IngredientBatchIngredientLog')(sequelize, DataTypes)
// const IngredientLogProductBatch = require('./models/IngredientLogProductBatch')(sequelize, DataTypes)
// const ProductIngredient = require('./models/ProductIngredient')(sequelize, DataTypes)
// const Product = require('./models/Product')(sequelize, DataTypes)
// const ProductBatch = require('./models/ProductBatch')(sequelize, DataTypes)
// const Supplier = require('./models/Supplier')(sequelize, DataTypes)
// const Location = require('./models/Location')(sequelize, DataTypes)
const User = require('./models/User')(sequelize, DataTypes)

// Ingredient.belongsTo(Supplier, { foreignKey: 'supplier' });
// IngredientBatch.belongsTo(Ingredient, { foreignKey: 'ingredientId' });
// ProductBatch.belongsTo(Product, { foreignKey: 'productId' });
// ProductBatch.belongsTo(User, { foreignKey: 'user' });
// IngredientLog.belongsTo(Ingredient, { foreignKey: 'ingredientId' });
// IngredientLog.belongsTo(IngredientBatch, { foreignKey: 'ingredientBatchNo' });
// IngredientLog.belongsTo(User, { foreignKey: 'user' });
// IngredientBatchIngredientLog.belongsTo(IngredientBatch, { foreignKey: 'batchNo' })
// IngredientBatchIngredientLog.belongsTo(IngredientLog, { foreignKey: 'logId' })
// IngredientLogProductBatch.belongsTo(IngredientLog, { foreignKey: 'ingredientLogId' });
// IngredientLogProductBatch.belongsTo(ProductBatch, { foreignKey: 'productBatchNo' });
// ProductIngredient.belongsTo(Ingredient, { foreignKey: 'ingredientId' });
// ProductIngredient.belongsTo(Product, { foreignKey: 'productId' });
// Location.belongsTo(IngredientBatch, { foreignKey: 'location' })
// Location.belongsTo(ProductBatch, { foreignKey: 'location' })

sequelize.authenticate()
    .then(() => console.log("Database connected"))
    .catch(err => console.error(err))

module.exports = sequelize