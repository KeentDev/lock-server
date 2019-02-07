const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');

const router = express.Router();

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
        if(data){
          if (data.length <= 0) {
            body.constructError(00, `Found no card information available on Serial ID #${serial_id}.`);
            res.send(body);
          } else {
            const payload = {
              'id_num': data.id_num
            };
  
            const token = jwt.sign(payload, config.secret, {
              expiresIn: '4hr' // expires in 24 hours
            });
  
            bodyData.token = token;
  
            body.data = bodyData;
            body.success = true;
  
            res.send(body);
          }
        }else{
          body.constructError(00, `Found no card information available on Serial ID #${serial_id}.`);
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

router.get('/esp-test', async (req, res) => {
  console.log('connection success');
  res.send('test');
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


module.exports = router;