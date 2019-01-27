const express = require('express');
const mongodb = require('mongodb');
const ObjectID = require('mongodb').ObjectID;
const jwt = require('jsonwebtoken');
const config = require('../config');

const serverUrl = '192.168.254.101';
const serverPort = 27017;

const router = express.Router();

Object.prototype.constructError = function (errorCode, errorMsg) {
  this.success = false;
  this.error_code = errorCode;
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

function verifyObjectId(id) {
  return new Promise((resolve, reject) => {
    try {
      let objectId = new ObjectID(id)

      resolve(objectId);
    } catch (error) {
      reject(error);
    }
  });
}

async function loadMongoDB() {
  const client = mongodb.MongoClient.connect(`mongodb://${serverUrl}:${serverPort}`, {
    useNewUrlParser: true
  });

  return await client;
}

async function loadCollections(collectionName) {
  const client = await loadMongoDB();

  return client.db('Thesis').collection(collectionName);
}

router.post('/rfid/auth', async (req, res) => {
  const rfid_cards = await loadCollections('RFID_Card');

  const serial_id = req.query.serial_id || req.body.serial_id || null;
  const body = {};

  if(serial_id){
    await rfid_cards
      .findOne({
        'serial_id': serial_id
      }, {
        'projection': {
          '_id': 0
        }
      })
      .then(data => {
        let body = {};
        let bodyData = {};

        if (data.length <= 0) {
          body.constructError(00, `Found no card information available on Serial ID #${serial_id}.`);
          res.send(body);
        } else {
          const payload = {
            'user_id': data.user_id
          };

          const token = jwt.sign(payload, config.secret, {
            expiresIn: '1h' // expires in 24 hours
          });

          bodyData.token = token;

          body.data = bodyData;
          body.success = true;

          res.send(body);
        }
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(err);
      });
  }else{
    body.constructError(01, 'A Serial ID parameter is required.');
    res.send(body);
  }
  
});

router.use((req, res, next) => {
  const token = req.body.token || req.query.token || req.headers['x-access-token'];

  let body = {};

  if(token) {
    jwt.verify(token, config.secret, (err, decoded) => {
      if(err) {
        body.constructError(05, 'Failed to authenticate.');
        return res.send(body);
      }else {
        req.decoded = decoded;
        next();
      }
    })
  }else {
    body.constructError(01, 'Please encode a valid token');

    return res.status(403).send(body);
  }

});

router.get('/list', async (req, res) => {
  const users = await loadCollections('Student_DB');

  const payload = req.body;

  const page_cursor = payload.page_cursor || 1;
  const page_size = payload.page_size || 0;
  const skip_items = (page_cursor - 1) * page_size;

  let body = {};

  await users
    .find({}, {
      projection: {
        'password': 0,
      }
    })
    .map((user) => {
      return {
        'name': {
          'first_name': user.first_name,
          'last_name': user.last_name
        },
        'student_id': user.id_num,
        'user_id': user._id
      }
    })
    .skip(skip_items)
    .limit(page_size)
    .toArray()
    .then(data => {
      let body = {};

      body.data = data;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    });
});
    
router.get('/profile', async (req, res) => {
  const users = await loadCollections('Student_DB');
  const studentId = req.body.student_id || null;
  const userId = req.body.user_id || null;

  let body = {};

  fetchProfile = async () => {
    return new Promise(async (resolve, reject) => {
      if (studentId) {
        await users.find({
            'id_num': studentId
          }, {
            projection: {
              '_id': 0,
              'password': 0
            }
          })
          .toArray()
          .then(data => {
            if (data.length > 0) {
              body.data = data;
              body.success = true;
            } else {
              body.constructError(00, `Student ID #${studentId} not found.`);
            }

            resolve(body);
          })
          .catch(err => {
            body.constructError(02, err);
            resolve(body);
          })

      } else if (userId) {
        verifyObjectId(userId)
          .then(async id => {
            return new Promise(async (resolve, reject) => {
              await users.find({
                  '_id': id
                }, {
                  projection: {
                    '_id': 0,
                    'password': 0
                  }
                })
                .toArray()
                .then(data => {
                  resolve(data)
                })
                .catch(err => {
                  body.constructError(02, err);
                  resolve(body);
                })
            });
          })
          .catch(err => {
            console.error(err);
            body.constructError(03, `Please encode a valid User ID format and value.`);
            resolve(body);
          })
          .then(data => {
            if (data.length > 0) {
              body.data = data;
              body.success = true;
            } else {
              body.constructError(00, `User ID ${userId} not found.`);
            }
            resolve(body);
          })
          .catch(err => {
            body.constructError(02, err);
            resolve(body);
          });
      } else {
        body.constructError(02, `User ID or Student ID is required for querying a user profile.`);
        resolve(body);
      }
    });
  }

  fetchProfile()
    .then(body => {
      res.send(body);
    })
    .catch(err => {
      console.error(err);
    })

});

router.get('/rental-info', async (req, res) => {
  const rentalInfos = await loadCollections('Student_Unit_Info');
  const userId = req.body.user_id || null;
  const unitId = req.body.unit_id || null;

  let body = {};

  if (userId && unitId) {
    body.constructError(01, 'Only either User ID or Unit ID can be a query, NOT both.');
    res.send(body);
  } else if (userId) {
    verifyObjectId(userId)
      .then(async id => {
        await rentalInfos
          .find({
            'user_id': userId
          }, {
            projection: {
              '_id': 0,
            }
          })
          .toArray()
          .then(data => {
            let body = {};

            if (data.length <= 0) {
              body.constructError(00, `Found no rental information available on user ID ${userId}.`);
            } else {
              body.data = data;
              body.success = true;
            }

            res.send(body);
          })
          .catch(err => {
            body.constructError(02, err);
            res.send(body);
          });
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid User ID format and value.`);
        res.send(body);
      });

  } else if (unitId) {
    verifyObjectId(unitId)
      .then(async id => {
        await rentalInfos
          .find({
            'unit_id': unitId
          }, {
            projection: {
              '_id': 0,
            }
          })
          .toArray()
          .then(data => {
            let body = {};

            if (data.length <= 0) {
              body.constructError(00, `Found no rental information available on unit ID ${unitId}.`);
            } else {
              body.data = data;
              body.success = true;
            }

            res.send(body);
          })
          .catch(err => {
            body.constructError(02, err);
            res.send(body);
          });
      })
      .catch(err => {
        console.error(err);
        body.constructError(03, `Please encode a valid Unit ID format and value.`);
        res.send(body);
      });
  } else {
    body.constructError(01, 'A User ID or Unit ID parameter is required.');
    res.send(body);
  }

});

router.get('/do/list', async (req, res) => {
  const officersCollection = await loadCollections('Discipline_Officers');

  let body = {};

  await officersCollection
    .find({})
    .toArray()
    .then(officers => {

      for (let i = 0; i < officers.length; i++) {
        officers[i].ObjectKeyMapper('_id', 'user_id');
        officers[i].ObjectKeyMapper('id_num', 'officer_id');
      }

      body.data = officers;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    });
})

router.get('/do/profile', async (req, res) => {
  const officersCollection = await loadCollections('Discipline_Officers');

  let officerId = req.body.officer_id || null;
  let userId = req.body.user_id || null;
  let body = {};

  if(officerId && userId){
    body.constructError(01, 'Only either User ID or Officer ID can be a query, NOT both.');
    res.send(body);
  } else if (officerId) {
    verifyObjectId(officerId)
      .then(async id => {
        await officersCollection
        .find({
          "id_num": officerId
        })
        .toArray()
        .then(data => {
          verifyOfficer(data, 'Officer', officerId);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        });
      })
      .catch(err => {
        body.constructError(03, `Please encode a valid Officer ID format and value.`);
        res.send(body);
      })
  } else if(userId) {
    verifyObjectId(userId)
      .then(async id => {
        await officersCollection
        .find({
          "_id": id
        })
        .toArray()
        .then(data => {
          verifyOfficer(data, 'User', userId);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        });
      })
      .catch(err => {
        body.constructError(03, `Please encode a valid User ID format and value.`);
        res.send(body);
      })
  } else {
    body.constructError(01, 'Please encode only either User ID or Officer ID can be a query, NOT both.');
    res.send(body);
  }

  function verifyOfficer(data, label, id) {
    if (data.length > 0) {
      let officerData = data[0];
      officerData.ObjectKeyMapper('_id', 'user_id');
      officerData.ObjectKeyMapper('id_num', 'officer_id');
      body.data = officerData;
      body.success = true;
    } else {
      body.constructError(00, `${label} with ID ${id} is not found.`);
    }

    res.send(body);
  }
})

module.exports = router;