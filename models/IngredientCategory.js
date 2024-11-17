module.exports = (sequelize, DataTypes) => {
    const IngredientCategory = sequelize.define('IngredientCategory', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            unique: true,
        }
    })

    return IngredientCategory
}