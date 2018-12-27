const express = require('express');
const mongodb = require('mongodb');
const ObjectID = require('mongodb').ObjectID;

const serverUrl = 'localhost';
const serverPort = 27017;

const router = express.Router();

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

function verifyObjectId(id, label, index) {
  return new Promise((resolve, reject) => {

    try {
      let objectId = new ObjectID(id);

      resolve(objectId);
    } catch (error) {
      reject(error);
    }

  });
}

async function loadMongoDB() {
  const client = await mongodb.MongoClient.connect(`mongodb://${serverUrl}:${serverPort}`, {
    useNewUrlParser: true
  });

  return client;
}

async function loadCollections(collectionName) {
  const client = await loadMongoDB();

  return client.db('Thesis').collection(collectionName);
}

router.get('/unit-list', async (req, res) => {
  const lockers = await loadCollections('Locker_Units');
  const area = req.body.area_num || null;

  let body = {};

  if (area) {
    await lockers
      .find({
        'unit_area': area
      }, {
        projection: {
          'slave_address': 0
        }
      })
      .toArray()
      .then(data => {
        let body = {};

        if (data.length > 0) {
          for (let i = 0; i < data.length; i++) {
            data[i].ObjectKeyMapper('_id', 'user_id');
          }

          body.data = data;
          body.success = true;
        } else {
          body.constructError(00, `Area number #${area} not found.`);
        }

        res.send(body);
      })
      .catch(err => {
        body.constructError(02, err);
        res.send(body);
      })
  } else {
    body.constructError(01, 'Area number parameter is required.');
    res.send(body);
  }

});

router.get('/area-list', async (req, res) => {
  const areas = await loadCollections('Locker_Area');

  let body = {};
  await areas
    .find({})
    .toArray()
    .then(data => {
      for (let i = 0; i < data.length; i++) {
        data[i].ObjectKeyMapper('_id', 'area_id');
      }

      body.data = data;
      body.success = true;

      res.send(body);
    })
    .catch(err => {
      body.constructError(02, err);
      res.send(body);
    })
});

router.get('/transaction/authorization', async (req, res) => {
  const lockers = await loadCollections('Locker_Units');
  const rentalInfos = await loadCollections('Student_Unit_Info');

  const unitId = req.body.unit_id || null;
  const userId = req.body.user_id || null;

  let apiCodes = [];
  let body = {};

  async function isUserAuthorized(userId) {
    if (userId) {
      try {
        let id = new ObjectID(userId);

        return await rentalInfos
          .findOne({
            'user_id': userId
          })
          .then(async userRentalData => {
            if (!!userRentalData) {
              if (userRentalData.mode == 'occupied') {
                apiCodes.push(2);
              } else if (userRentalData.mode == 'reserved') {
                apiCodes.push(2)
              }
              return Promise.resolve(false);
            } else {
              console.log(userRentalData);
              return Promise.resolve(true);
            }
          })
          .catch(err => {
            body.constructError(02, err);
            res.send(body);
            return Promise.reject(false);
          });

      } catch (error) {
        body.constructError(3.2, 'Please encode a valid User ID format and value.');
        return Promise.reject(false);
      }
    } else {
      body.constructError(1.2, `User ID parameter is required.`);
      return Promise.reject(false);
    }
  }

  async function isUnitAuthorized(unitId) {
    if (unitId) {
      try {
        let id = new ObjectID(unitId);

        let lockerData = await lockers.findOne({
          '_id': id
        }, {
          projection: {
            '_id': 0
          }
        });

        return new Promise((resolve, reject) => {
          if (!!lockerData) {

            if (lockerData.unit_status === 'available') {
              resolve(true);
            } else {
              apiCodes.push(1);
              resolve(false);
            }

          } else {
            body.constructError(00, `Unit ID ${id} is not found.`);
            resolve(false);
          }
        })
      } catch (error) {
        body.constructError(3.1, 'Please encode a valid Unit ID format and value.');
        return Promise.reject(false);
      }
    } else {
      body.constructError(1.1, 'Unit ID parameter is required.');
      return Promise.reject(false);
    }
  }

  await Promise.all([
    isUnitAuthorized(unitId),
    isUserAuthorized(userId)
  ]).then(async auth => {
    const activityLogs = await loadCollections('Unit_Activity_Logs');

    let unitAuthorized = auth[0];
    let userAuthorized = auth[1];
    let rentAuthorized = await unitAuthorized && await userAuthorized;

    activityLogs.insertOne({
      'type': 'rent_authorize',
      'date': null,
      'authorized': await rentAuthorized,
      'user_id': userId,
      'unit_id': unitId
    }, {}, (err, result) => {
      if (!err && (result.insertedCount >= 1)) {
        let data = {
          'activity_log_id': result.insertedId,
          'authorized': rentAuthorized
        }

        body.data = data;
        apiCodes.length > 0 ? body.data.api_msg_code = apiCodes : null;
        body.success = true;

        res.send(body);
      } else {
        body.constructError(02, 'There is a problem checking your unit. Please try again later.');
        res.send(body);
      }
    })
  }).catch(err => {
    console.error(err);
    res.send(body);
  });
});

router.post('/transaction/feed', async (req, res) => {

  const authLogId = req.body.auth_activity_log_id || null;
  const amount = req.body.transaction_amount || null;
  const transactionType = req.body.transaction_type || null;
  const userId = req.body.user_id || null;

  let body = {};

  !amount ? body.constructError(01, `Amount parameter is required.`) : null;
  !transactionType ? body.constructError(01, `Transaction type parameter is required.`) : null;
  !userId ? body.constructError(01, `User Id parameter is required.`) : null;

  if (amount && transactionType && userId) {
    verifyObjectId(userId)
      .then(async id => {
        await isFeedAuthorized(authLogId)
          .then(async isAuth => {
            async function isUpdateAuthorized() {
              return new Promise(async (resolve, reject) => {
                console.log('is auth:' + isAuth);
                if (isAuth) {
                  const transactionLogs = await loadCollections('Transaction_Log');

                  await transactionLogs
                    .insertOne({
                      'type': transactionType,
                      'amount': amount,
                      'date': null,
                      'user_id': userId
                    })
                    .then(data => {
                      resolve(data);
                    })
                    .catch(err => {
                      console.error(err);
                      reject(err);
                    })
                } else {
                  res.send('not auth');
                }
              })
            }

            body.data = {
              'transaction_authorized': false,
              'user_id': userId,
              'date': null
            };
            body.success = true;

            isUpdateAuthorized()
              .then(result => {
                body.data.transaction_authorized = true;
                res.send(body);
              })
              .catch(err => {
                console.error(err);
                body.success = true;
                res.send(body);
              })
          })
          .catch(bodyError => {
            res.send(bodyError);
          })
      })
      .catch(err => {
        body.constructError(03, `Please encode a valid User ID format and value.`);
        res.send(body);
      })
  } else {
    res.send(body);
  }
});

router.post('/transaction/acquire', async (req, res) => {

  const payload = req.body;
  const userId = payload.user_id || null;
  const acquireType = payload.acquire_type || null;
  const authLogId = payload.auth_activity_log_id || null;

  let body = {};

  !userId ? body.constructError(01, `User ID parameter is required.`) : null;
  !authLogId ? body.constructError(01, `Authorization Log ID parameter is required.`) : null;
  !acquireType ? body.constructError(01, `Acquire type parameter is required.`) : null;

  if (userId && authLogId && acquireType) {
    const unitActivityLogs = await loadCollections('Unit_Activity_Logs');

    await isFeedAuthorized(authLogId)
      .then(async isAuth => {
        if (isAuth) {
          let type = null;
          switch (acquireType) {  
            case 'Rent':
              type = 'start_session';
              break;
            case 'Extend':
              type = 'extend_session';
              break;
            case 'Reserve':
              type = 'reserve';
              break;
            default:
              type = null;
          }
          await unitActivityLogs
            .insertOne({
              'type': type,
              'date': null,
              'authorized': true,
              'user_id': userId,
              'unit_id': '1234'
            })
            .then(result => {
              let data = {
                'acquire_type': type,
                'user_id': userId
              }

              body.data = data;
              body.success = true;

              res.send(body);
            })
            .catch(err => {
              console.error(err);
              res.send(body);
            })
        } else {
          body.constructError(04, 'Authorized Log is not valid');
          res.send(body);
        }
      })
      .catch(err => {
          body.constructError(03, 'Please encode a valid Authorized Log ID format and value.');
          res.send(err);
      })
  }else{
    res.send(body);
  }

});

async function isFeedAuthorized(authLogId) {
  if (authLogId) {
    return new Promise((resolve, reject) => {
      verifyObjectId(authLogId)
        .then(async id => {
          const unitActivityLogs = await loadCollections('Unit_Activity_Logs');

          await unitActivityLogs
            .find({
              '_id': id
            }, {
              projection: {
                'authorized': 1,
                'type': 1,
                '_id': 0
              }
            })
            .toArray()
            .then(data => {
              if (data.length > 0) {
                let thisData = data[0];
                let isAuth = false;
                let isRentAuth = false;

                if (thisData.type === 'rent_authorize') {
                  isRentAuth = true;
                  if (thisData.authorized) {
                    isAuth = true;
                  } else {
                    let bodyError = {};
                    bodyError.constructError(04, `Rental transaction is not authorized.`);

                    return reject(bodyError);
                  }
                } else {
                  let bodyError = {};
                  bodyError.constructError(04, `Activity log is not of rent auth type.`);

                  return reject(bodyError);
                }
                if (isAuth && isRentAuth) {
                  // body.data = data;
                  // body.success = true;
                  return resolve(true);
                } else {
                  // body.success = true;
                  return resolve(false);
                }
              } else {
                let bodyError = {};
                bodyError.constructError(0, `Activity log with ID ${authLogId} not found.`);

                return reject(bodyError);
                // return reject(false);
              }
            })
            .catch(err => {
              let bodyError = {};
              bodyError.constructError(02, err);

              return reject(bodyError);
              // return reject(false);
            })
        })
        .catch(err => {
          let bodyError = {};

          bodyError.constructError(03, 'Please encode a valid Authorized Log ID format and value.');
          reject(bodyError);
        })
    });
  } else {
    let bodyError = {};
    bodyError.constructError(01, `Activity log ID of rental authentication is required.`);
    return Promise.reject(bodyError);
  }
}

module.exports = router;