module.exports = (sequelize, DataTypes) => {
    const Brand = sequelize.define('Brand', {
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

    return Brand
}

