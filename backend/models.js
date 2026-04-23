// backend/models.js
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false
});

const User = sequelize.define('User', {
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nickname: {
    type: DataTypes.STRING,
    defaultValue: 'Stranger'
  },
  gender: {
    type: DataTypes.STRING,
    defaultValue: 'other'
  },
  age: {
    type: DataTypes.STRING,
    defaultValue: '18-25'
  },
  country: {
    type: DataTypes.JSON,
    defaultValue: { code: '🌍', name: 'Global' }
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

const Group = sequelize.define('Group', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  inviteCode: {
    type: DataTypes.STRING,
    unique: true
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  creatorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

const GroupMember = sequelize.define('GroupMember', {
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

const Message = sequelize.define('Message', {
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  senderNickname: {
    type: DataTypes.STRING
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING, // 'text' or 'image'
    defaultValue: 'text'
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: true // Null if private message (though we focus on groups now)
  }
});

// Associations
User.hasMany(Group, { foreignKey: 'creatorId' });
Group.belongsTo(User, { as: 'creator', foreignKey: 'creatorId' });

Group.belongsToMany(User, { through: GroupMember, as: 'members', foreignKey: 'groupId' });
User.belongsToMany(Group, { through: GroupMember, as: 'groups', foreignKey: 'userId' });

Group.hasMany(Message, { foreignKey: 'groupId' });
Message.belongsTo(Group, { foreignKey: 'groupId' });

module.exports = { sequelize, User, Group, GroupMember, Message };
