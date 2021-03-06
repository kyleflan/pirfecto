var express = require("express");
var jsmin = require('jsmin').jsmin;
var fs = require('fs');
var app = express();
var rpi433 = require('rpi-433-v3'),
	rfEmitter = rpi433.emitter({
		pin: 0,
		pulseLength: 185,
		protocol: 1
	});

// Set the HTTP port 
var PORT=8888;

// define global vars
var outlet_file, json_str, outlets, index_html;

function get_index(req) {
	// build HTML template
	if (req) {
		var with_header = !req.query.no_headers;
	} else {
		var with_header = true;
	}

	var no_header_arg = (with_header) ? '' : '&no_headers=true';
	index_html = `
	<html>
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css">
		<script src="//maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js"></script>
		<script src="//ajax.googleapis.com/ajax/libs/jquery/1.11.1/jquery.min.js"></script>
		<title>
			RF Control
		</title>
	</head>
	<body>
	<div class="container">
	`
	if (with_header) {
		index_html += `
			<div class="row" id="header">
				<div class="col-md-3 col-md-offset-3 text-center">
					<h3>RF Control Center</h3>
				</div>
				<div class="col-md-3 text-center">
					<h3><a href="/">Refresh</a></h3>
				</div>
			</div>
		`
	}
	index_html += `
		<div class="row">
			<div class="col-sm-6 col-md-offset-3">
			<!--msgholder-->
			</div>
		</div>
	<div id="outlets">
	`
	// add row for each outlet
	for (var i in outlets) {
		index_html += '<div class="row"><div class="col-md-12 text-center"><h2>' + outlets[i].name + '</h2></div></div>';

		index_html += '<div class="row">';
		index_html += '<div class="col-md-6 col-md-offset-3">';
		index_html += '<div class="btn-group btn-group-justified">';
		index_html += '<a href="./control?outlet_id=' + outlets[i].id + '&signal=ON' + no_header_arg + '" class="btn btn-success" role="button">ON</a>';
		index_html += '<a href="./control?outlet_id=' + outlets[i].id + '&signal=OFF' + no_header_arg + '" class="btn btn-danger" role="button">OFF</a>';
		index_html += '</div>';
		index_html += '</div>';
		index_html += '</div>';
	}

	index_html += `
	</div>
	</div>
	</body>
	</html>`;

	return index_html;

}

function init() {
/* Handle initialization of global vars: outlet_file, json_str, outlets 
and index_html. */

	// Load outlets configuration
	outlet_file = fs.readFileSync('outlets.json', 'utf8'); 
	json_str = jsmin(outlet_file.toString()); 
	outlets = JSON.parse(json_str); 
	outlets = outlets.filter(function(outlet) {
		return outlet.enabled	
	});

	index_html = get_index();


	console.log('Initialized successfully.');
}

function get_outlet_index_by_id(id) {
	return outlets.findIndex(function(item, i) {
		return item.id == id;
	});
}


function send_code(outlet_id, signal) {
/* Send the signal specified by signal to the outlet_id specified
by outlet_id */
	var code = 0;
	var outlet_index = get_outlet_index_by_id(outlet_id);
	if (signal == 'ON') {
		code = outlets[outlet_index].ON;
	} else { // default to OFF signal
		code = outlets[outlet_index].OFF;
		signal = 'OFF';
	}
	return rfEmitter.sendCode(code)
	/* Send the specified code and construct an HTML message element to be inserted
	   into the web app page */
		  .then(function(stdout) {
			console.log('Code sent: ', stdout);
			var div = '<div class="alert alert-success">';
			div +=  "Successfully sent '" + signal + "' signal to outlet: " + outlets[outlet_index].name;
			div += '</div>';
			return div;
		  }, function(error) {
			var div = '<div class="alert alert-danger">';
			div +=  "Could not send '" + signal + "' signal to outlet: " + outlets[outlet_index].name + ". Error: " + error;
			div += '</div>';
			return div;
		  });
}


// express route functions
app.get("/", function(req, res) { // default function
	init();
	console.log('orig url: ' + req.originalUrl);
	console.log(req.route.path);
	with_header = true;
	if (req.query.no_headers) {
		with_header = false;
	}
	res.send(get_index(req));
	//res.sendfile('temp-index.html');
});

app.get("/outlets", function(req, res) { 
/* Return outlet info. If an outlet_id is specified then return config info
for that outlet. Otherwise return config info for all outlets */
	init(); // get latest outlet config
	if (req.query.outlet_id) {
		res.json(outlets[get_outlet_index_by_id(req.query.outlet_id)]);
	} else {
		res.json(outlets);
	}	
});

app.get("/control", function(req, res) { // outlet control API
	init(); // get latest outlet config
	var msg = '';
	if (req.query.signal == 'ON'  // send ON code
		&& (! (typeof get_outlet_index_by_id(req.query.outlet_id) === 'undefined'))
		) {
			let promise = send_code(req.query.outlet_id, req.query.signal);
			setTimeout(function() {
				promise.then(function(value) {
					msg = value;
					res.send(get_index(req).replace('<!--msgholder-->', msg));
					
				});
		});
	} else if (req.query.signal == 'OFF'  // send OFF code
		&& (! (typeof get_outlet_index_by_id(req.query.outlet_id) === 'undefined'))
		){
			let promise = send_code(req.query.outlet_id, req.query.signal);
			setTimeout(function() {
				promise.then(function(value) {
					msg = value;
					res.send(get_index(req).replace('<!--msgholder-->', msg));
					
				});
		});
	} else { // didn't receive an ON or OFF signal, so return error
		msg ='<div class="alert alert-danger">';
		msg +=  "Invalid arguments.";
		msg += '</div>';
		res.send(get_index(req).replace('<!--msgholder-->', msg));
	}
});

// run app
app.listen(PORT, function() {
	console.log("Listening on " + PORT);
});
