const express = require('express');
const mongodb = require('mongodb');
const ObjectID = require('mongodb').ObjectID;

const serverUrl = 'localhost';
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
        'student_id_num': user.id_num,
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
        officers[i].ObjectKeyMapper('_id', 'officer_id');
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
  let body = {};

  try {
    const id = new ObjectID(officerId);

    if (officerId) {
      await officersCollection
        .find({
          "_id": id
        })
        .toArray()
        .then(data => {
          if (data.length > 0) {
            body.data = data;
            body.success = true;
          } else {
            body.constructError(00, `Officer user with ID ${id} is not found.`);
          }

          res.send(body);
        })
        .catch(err => {
          body.constructError(02, err);
          res.send(body);
        });
    } else {
      body.constructError(01, 'Officer user ID parameter is required.');
      res.send(body);
    }
  } catch (error) {
    console.error(error)
    body.constructError(03, 'Please encode a valid user id format and value.');
    res.send(body);
  }
})

module.exports = router;