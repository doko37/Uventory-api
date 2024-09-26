module.exports = (sequelize, DataTypes) => {
    const IngredientSubCategory = sequelize.define('Ingredient', {
        name: {
            type: DataTypes.STRING(255),
            primaryKey: true,
            unique: true,
            notNull: true
        }
    })

    return IngredientSubCategory
}