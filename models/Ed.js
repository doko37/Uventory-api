module.exports = (sequelize, DataTypes) => {
    const Ed = sequelize.define('Ed', {
        id: {
            type: DataTypes.STRING(255),
            primaryKey: true,
            unique: true,
        },
    })

    return Ed
}