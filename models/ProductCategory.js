module.exports = (sequelize, DataTypes) => {
    const ProductCategory = sequelize.define('ProductCategory', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(255),
            unique: true,
        },
    }, {
        paranoid: true
    })

    return ProductCategory
}