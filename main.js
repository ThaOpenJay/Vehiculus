var HorariusHelper = require("./HorariusHelper");
var http = require('http');
var url = require("url");
var moment = require("moment");
var PORT= process.env.OPENSHIFT_NODEJS_PORT || 8080;
var host= process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";

    // Parameters
        // TODO : Prendre groupe de tutorat en parametre (Si pas de groupe de tutorat, ne pas masquer tutorat)
        // TODO : prendre en parametre si on enleve les multi-day events (Enlevé par defaut)

    // TODO : HTTPS support
    // TODO : Parse the calendars options so we can add a description or modify the name of the calendar
    // TODO : Enleve tutorat inutile
    // TODO : S'assurer de bien catcher les exceptions, le service ne doit pas crasher

// Create the HTTP server and use the function handleRequest has handler
var server = http.createServer(handleRequest);

// Start the server on PORT
server.listen(PORT, host, function(){
    console.log("HorariusCleaner listening on Port : %s", PORT);
});

function handleRequest(req, res){
    var parsedUrl = url.parse(req.url, true);
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log(moment().format("MMMM Do YYYY, HH:mm:ss") + " : " + ip + " requested  "+parsedUrl.href);

    if(parsedUrl.pathname == "/") {
        if (parsedUrl && parsedUrl.query && parsedUrl.query.cip) {
            HorariusHelper.getCalendar(parsedUrl.query.cip, function (error, calendar) {
                if (error) {
                    res.statusCode = 400;
                    console.log("Error Occured At "+new Date().toString() + ": ");
                    console.log(error);
                    res.end(error);     // CIP is invalid or response received is invalid
                } else {
                    // Set headers to force download of file
                    res.setHeader("Content-Type", "text/x-download;charset=UTF-8");
                    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''"+parsedUrl.query.cip+"_UdeS.ics");
                    res.end(calendar);
                }
            });
        } else {
            res.statusCode = 400;
            res.end("Please provide a CIP.");
        }
    }else{
        res.statusCode = 400;
        res.end("This url is not allowed.");
    }
}
