module.exports = (sequelize, DataTypes) => {
    const ProductTemplateIngredient = sequelize.define('ProductTemplateIngredient', {
        templateId: {
            type: DataTypes.UUID,
            references: {
                model: 'ProductTemplates',
                key: 'id'
            }
        },
        ingredientId: {
            type: DataTypes.INTEGER.UNSIGNED,
            references: {
                model: 'Ingredients',
                key: 'id'
            }
        },
        qty: {
            type: DataTypes.FLOAT
        }
    })

    return ProductTemplateIngredient
}