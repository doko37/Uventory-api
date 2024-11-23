module.exports = (sequelize, DataTypes) => {
    const Supplier = sequelize.define('Supplier', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            unique: true,
            autoIncrement: true
        },
        region: {
            type: DataTypes.ENUM('NZ', 'Overseas')
        },
        name: {
            type: DataTypes.STRING(255),
            unique: true
        },
        email: {
            type: DataTypes.STRING(255)
        },
        phone: {
            type: DataTypes.STRING(255)
        },
        person: {
            type: DataTypes.STRING(255)
        },
        address: {
            type: DataTypes.STRING(255)
        }
    }, {
        paranoid: true
    })

    return Supplier
}
