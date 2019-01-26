const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');

const app = express();

app.set('superSecret', config.secret);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

app.use(morgan('dev'));

const user = require('./routes/user');
const locker = require('./routes/locker');

app.use('/user', user);
app.use('/locker', locker);

const port = process.env.PORT || 5000;

app.listen(port, function() {
  console.log(`Server has started on port ${port} `);
})