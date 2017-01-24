let express = require('express');
let bodyParser = require('body-parser');
let pgp = require('pg-promise')();

let buildings = require('./buildings.json');
let config = require('./config');

let db = pgp(config.dbUrl);
let app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.post('/loc', function (req, res) {
  let locations = req.body.locations;
  let userId = req.body.userId;

  for (let data of locations) {
    let {lat, lon, timestamp} = data;
    let location = lat + ',' + lon;

    let query = 'INSERT INTO locations(location, startDate, userId) values($1, $2, $3)';

    // TODO: Move out of loop and into bulk insert to speed up
    db.any(query, [location, timestamp, userId])
      .then(function () {
        res.send('Inserted location into DB');
      }).catch(function (err) {
        console.error(err);
        res.send('Error ' + err);
      });
  }
});

function hexToRgb (hex) {
  let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function searchBuildings (name) {
  for (let building of buildings) {
    if (building.name && building.name.substring(0, name.length).toLowerCase() === name.toLowerCase()) {
      console.log(building);
      return `${building.lat} , ${building.lng}`;
    }
  }

  console.log('NO BUILDING FOUND FOR "' + name + '"');
}

app.post('/event', function (req, res) {
  let {name, icon, startDate, endDate, details, hostName, locationBuilding, locationRoom} = req.body;
  let locationName = locationBuilding + ' ' + locationRoom;

  // let location = req.body.location;
  let rgb = hexToRgb(req.body.color);
  let color = `${rgb.r / 255} ${rgb.g / 255} ${rgb.b / 255} 1.0`;
  let location = searchBuildings(locationBuilding);

  console.log({name, icon, startDate, endDate, details, hostName, locationName, location, color});

  let query = `INSERT INTO events(name, icon, startDate, endDate, details, hostName, locationName, location, color)
                  values($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
  let arrayParams = [name, icon, startDate, endDate, details, hostName, locationName, location, color];

  db.any(query, arrayParams)
      .then(function () {
        res.send('Inserted into DB');
      }).catch(function (err) {
        console.error(err);
        res.send('Error ' + err);
      });
});

app.get('/init', function (req, res) {
  db.any('CREATE TABLE locations ( id SERIAL PRIMARY KEY, startDate timestamptz, location POINT, userId TEXT)')
    .then(function (result) {
      res.send('Database (events) Initialized!');
    }).catch(function (err) {
      console.error(err);
      res.send('Error ' + err);
    });
});

app.get('/hits', function (req, res) {
  res.send({count: config.hitCount});
});

app.get('/feed', function (req, res) {
  let today = db.any('SELECT * FROM events WHERE startDate > TIMESTAMP \'today\' AND startDate < TIMESTAMP \'tomorrow\' + interval \'4 hours\'');
  let tomorrow = db.any('SELECT * FROM events WHERE startDate >= TIMESTAMP \'tomorrow\' AND startDate < TIMESTAMP \'tomorrow\' + interval \'1 day\'');
  let upcoming = db.any('SELECT * FROM events WHERE startDate >= TIMESTAMP \'tomorrow\' + interval \'1 day\' AND startDate < TIMESTAMP \'tomorrow\' + interval \'7 day\'');

  Promise
    .all([today, tomorrow, upcoming])
    .then(function (sections) {
      console.log(sections);

      let payload = {
        'sectionTitles': ['Today', 'Tomorrow', 'This Week'],
        'sections': sections
      };

      res.send(payload);
    }).catch(function (err) {
      console.log('err', err);
    });
});

app.get('/db', function (req, res) {
  // THIS IS A HORRIBLE SQL VULNERABILITY, BUT I'M SURE YOU KNOW
  db.any('SELECT * FROM ' + req.query.name)
  .then(function (result) {
    console.log(result['rows']);
    res.send(result.rows);
  }).catch(function (err) {
    console.error(err);
    res.send('Error ' + err);
  });
});

app.get('/drop', function (req, res) {
  // THIS IS A HORRIBLE SQL VULNERABILITY, BUT I'M SURE YOU KNOW
  db.any('TRUNCATE ' + req.query.name)
    .then(function (result) {
      console.log(result['rows']);
      res.send(result.rows);
    }).catch(function (err) {
      console.error(err);
      res.send('Error ' + err);
    });
});

app.get('/delete', function (req, res) {
  db.any('DELETE FROM ' + req.query.name + ' WHERE id = ' + req.query.id)
    .then(function (result) {
      console.log(result['rows']);
      res.send(result.rows);
    }).catch(function (err) {
      console.error(err);
      res.send('Error ' + err);
    });
});

app.listen(process.env.PORT || 8000);
