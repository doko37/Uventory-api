module.exports = (sequelize, DataTypes) => {
    const Brand = sequelize.define('Brand', {
        name: {
            type: DataTypes.STRING(255),
            primaryKey: true,
            unique: true,
        }
    })

    return Brand
}

