const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const mongodb = require('mongodb');
const serverUrl = 'localhost';
const serverPort = 27017;

const app = express();

app.set('superSecret', config.secret);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

app.use(morgan('dev'));

const rootApi = require('./routes/root');
const user = require('./routes/user');
const locker = require('./routes/locker');
// const statistics = require('./routes/statistics');

global.loadMongoDB = async function() {
  const client = mongodb.MongoClient.connect(`mongodb://${serverUrl}:${serverPort}`, {
    useNewUrlParser: true
  });

  return await client;
}

global.loadCollections = async function(collectionName) {
  const client = await loadMongoDB();

  return client.db('Thesis').collection(collectionName);
}

Object.prototype.constructError = function (errorCode, errorMsg) {
  this.success = false;
  if (!this.error_code) {
    this.error_code = [];
  }
  this.error_code.push(errorCode);

  if (!this.error_msg) {
    this.error_msg = [];
  }
  this.error_msg.push(errorMsg);

  if (errorCode === 02) {
    console.error(`Server error: ${errorMsg}`);
  }
}

Object.prototype.ObjectKeyMapper = function (oldKey, newKey) {
  let value = this[oldKey];

  delete this[oldKey];
  this[newKey] = value;
}

global.verifyObjectId = function(id) {
  return new Promise((resolve, reject) => {
    try {
      let objectId = new ObjectID(id)

      resolve(objectId);
    } catch (error) {
      reject(error);
    }
  });
}

app.use('/', rootApi);
app.use('/user', user);
app.use('/locker', locker);
// app.use('/stats', statistics);

const port = process.env.PORT || 5000;

app.listen(port, function() {
  console.log(`Server has started on port ${port} `);
})