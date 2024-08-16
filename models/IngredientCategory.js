module.exports = (sequelize, DataTypes) => {
    const IngredientCategory = sequelize.define('IngredientCategory', {
        name: {
            type: DataTypes.STRING(255),
            unique: true,
            primaryKey: true
        }
    })

    return IngredientCategory
}