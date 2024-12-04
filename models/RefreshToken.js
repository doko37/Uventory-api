module.exports = (sequelize, DataTypes) => {
    const RefreshToken = sequelize.define('RefreshToken', {
        token: {
            type: DataTypes.STRING(512),
            primaryKey: true,
            unique: true,
        }
    })

    return RefreshToken
}

