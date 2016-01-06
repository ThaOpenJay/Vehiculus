var XRegExp = require("xregexp").XRegExp;
var fs = require("fs");
var request = require("request");

// Constants
const horariusURL = "http://www.gel.usherbrooke.ca/horarius/ical";                              // Url to get the original calendar
const suggestedRefreshTimeInMinute = "30";                                                      // Suggested Time (X-PUBLISHED-TTL) in minute. NOTE : This param is ignored by Google Calendar and some others
const exceptions = ["projet", "final", "intendants", "pr\u00E9sentations", "cong\u00E9"];       // We won't add a suffix when one of these words is contained in the summary

// Date Parsers
var dateParser = XRegExp("^ (?<year>   [0-9]{4}     )    # year    \n\
                            (?<month>  [0-9]{2}     )    # month   \n\
                            (?<day>    [0-9]{2}     )    # day", "x");

var dateParserWithHourMinuteSecond = XRegExp("^ (?<year>   [0-9]{4}     )    # year    \n\
                                                (?<month>  [0-9]{2}     )    # month   \n\
                                                (?<day>    [0-9]{2}     ) T  # day     \n\
                                                (?<hour>   [0-9]{2}     )    # hour    \n\
                                                (?<minute> [0-9]{2}     )    # minute  \n\
                                                (?<second> [0-9]{2}     )    # second", "x");

var HorariusHelper =  {
    getCalendar : function(cip, callback){
        request.get(horariusURL+"?cip="+cip, function(error, response, body){
            if (!error) {
                //Parse the body of the response
                var parsedBody = HorariusHelper.parseResponse(body);

                if(parsedBody.error == undefined) {
                    // Parse the events
                    var eventList = HorariusHelper.parseEvents(parsedBody.events);

                    // Trim the events (Remove all days events, change summary, etc)
                    eventList = HorariusHelper.trimEvents(eventList, [], true);     // TODO : Pass a list of tutorat to remove and a boolean indicating if we should remove all day events

                    // Reconstruction of the calendar
                    var calendar = HorariusHelper.reconstructCalendar(parsedBody.calendarInfos, eventList);

                    if (callback) {
                        // Send the reconstructed calendar to the callback
                        callback(undefined, calendar);
                    }
                }else{
                    if(callback){
                        // An error occured, send it to the callback
                        callback(parsedBody.error);
                    }
                }
            }else{
                if(callback){
                    // An error occured, send it to the callback
                    callback(error);
                }
            }
        });
    },

    parseResponse: function(body){
        if(body.indexOf("BEGIN:VCALENDAR") == 0) {
            // The first line of the response represent a valid calendar
            // We split the response in 2 parts : The calendar informations and the events
            var calendarInfos = body.substring(0, body.indexOf("BEGIN:VEVENT"));
            var events = body.substring(body.indexOf("\r\nBEGIN:VEVENT"), body.length);

            return {"calendarInfos": calendarInfos, "events": events.split(/\r\nBEGIN:.*\r\n/g)};
        }else if(body.indexOf("CIP invalide") != -1) {
            return {error : "Invalid CIP"};
        }else{
            return {error : body};
        }
    },

    parseEvents: function(events){
        var eventList = [];
        var json = {};
        var eventLines;
        var keyAndValue;
        var splitIndex;

        for(var j=0;j<events.length;j++){
            // We split the line of the event
            eventLines = events[j].split("\r\n");
            for(var i=0;i<eventLines.length;i++){
                // The value are of the form KEY:VALUE so we parse them
                splitIndex = eventLines[i].indexOf(':');
                keyAndValue = [eventLines[i].substring(0,splitIndex),eventLines[i].substring(splitIndex+1)];

                // We don't want the END object into the parsed object neither do we want undefined fields
                if(keyAndValue[0] != "END" && keyAndValue[0] != "" && keyAndValue[0] != undefined && keyAndValue[1] != undefined){
                    json[keyAndValue[0]] = keyAndValue[1];
                }
            }
            if(Object.keys(json).length > 0){
                eventList.push(json);
                json = {};
            }
        }

        return eventList;
    },

    trimEvents: function(eventsList, tutoList, removeAllDayEvents) {
        var appList = [];                           // List containing information regarding each APP

        // TODO : Implement Tutorat trimming
        /*if(tutoList && tutoList.length > 0){

         }*/

        if(removeAllDayEvents == undefined){
            removeAllDayEvents = true;              // By default, will remove all days events
        }

        if (removeAllDayEvents) {
            var lastAPP, currentAPP = "";

            // We remove event that doesn't have a DTEND value
            // At the same occasion, we create the list of APP based on their start date
            for (var i = 0; i < eventsList.length; i++) {
                if (eventsList[i].hasOwnProperty("DTSTART;VALUE=DATE")) {
                    lastAPP = currentAPP;
                    currentAPP = eventsList[i]["SUMMARY"];

                    currentAPP = currentAPP.substr(0, currentAPP.indexOf(":"));

                    if (currentAPP != lastAPP) {
                        appList.push({
                            "name": currentAPP,
                            "start": eventsList[i]["DTSTART;VALUE=DATE"]
                        });
                    }

                    delete eventsList[i];       // We delete the event from the calendar
                } else if (eventsList[i].hasOwnProperty("DTSTART;VALUE=DATE;VALUE=DATE")) {
                    delete eventsList[i];       // We delete the single day event from the calendar
                }
            }

            var appIndex = 0;
            var currentEventDate, appDate, nextAppDate, result;

            // Parse the date of the APP
            result = XRegExp.exec(appList[appIndex].start, dateParser);
            // Create a new Date Object
            appDate = new Date( parseInt(result.year, 10),
                                parseInt(result.month, 10) - 1,
                                parseInt(result.day, 10));

            for (var i = 0; i < eventsList.length; i++) {
                if (eventsList[i]) {

                    // Parse Current Event Date
                    result = XRegExp.exec(eventsList[i]["DTSTART"], dateParserWithHourMinuteSecond);
                    // Create the Date Object
                    currentEventDate = new Date(parseInt(result.year, 10),
                                                parseInt(result.month, 10) - 1,
                                                parseInt(result.day, 10),
                                                parseInt(result.hour, 10),
                                                parseInt(result.minute, 10),
                                                parseInt(result.second, 10));

                    if (nextAppDate == undefined || nextAppDate == appDate && appIndex < appList.length - 1) {
                        // Parse the date of the next APP
                        result = XRegExp.exec(appList[appIndex + 1].start, dateParser);
                        // Create the Date Object
                        nextAppDate = new Date( parseInt(result.year, 10),
                                                parseInt(result.month, 10) - 1,
                                                parseInt(result.day, 10));
                    }

                    // If the current Date is > than the date of the next APP, we are now in the next APP
                    if (currentEventDate > nextAppDate && appIndex < appList.length - 1) {
                        appIndex++;
                        appDate = nextAppDate;
                    }

                    // We verify if the summary of the current event match one of these conditions
                    if (exceptions.some(function(exception) {if(eventsList[i]["SUMMARY"].toLowerCase().indexOf(exception) != -1){return true;} })) {
                        // The event is in the exception list, we do nothing
                    }else if(eventsList[i]["SUMMARY"].toLocaleLowerCase().indexOf("tutorat") != -1){
                        // The event is a tutorat, we append the tutorat Group and the name of the APP
                        eventsList[i]["SUMMARY"] += " - " + eventsList[i]["DESCRIPTION"] + " - " + appList[appIndex].name;
                    }else{
                        // The event doesn't need special treatment, simply append the name of the APP
                        eventsList[i]["SUMMARY"] += " - " + appList[appIndex].name;
                    }
                }
            }
        }
        return eventsList;
    },

    reconstructCalendar: function (calendarInfos, eventList) {
        // TODO : Parse the calendarInfos and reconstruct them
        var keys,
            key,
            calendarInfoInsertIndex,
            calendar = "";

        if(calendarInfos.indexOf("X-WR-CALDESC") != -1){
            calendarInfoInsertIndex = calendarInfos.indexOf("X-WR-CALDESC:\r\n")+17;
            calendarInfos = calendarInfos.slice(0,calendarInfoInsertIndex)+ "X-PUBLISHED-TTL:PT"+suggestedRefreshTimeInMinute+"M\r\n"+calendarInfos.slice(calendarInfoInsertIndex);
        }
        calendar += calendarInfos;               // We add the calendar header

        for (var i = 0; i < eventList.length; i++) {
            if (eventList[i] != undefined) {             // Verify that the event has not been deleted while trimming
                keys = Object.keys(eventList[i]);
                calendar += "BEGIN:VEVENT\r\n";      // We add the delimiter for a new event
                for (var j = 0; j < keys.length; j++) {
                    key = keys[j];
                    calendar += key + ":" + eventList[i][key] + "\r\n";
                }
                calendar += "END:VEVENT\r\n";        // We add the delimiter for the end of an event
            }
        }

        calendar += "END:VCALENDAR\r\n";         // We add the delimiter for the end of the calendar

        return calendar;
    },

    writeCalendarToFile: function(filename, calendar) {
        fs.writeFile(filename, calendar, function(err){     // Writing to file
            if(err){
                console.log(err);
            }else{
                console.log("The calendar was saved to test.ical");
            }
        });
    }
};

module.exports = HorariusHelper;