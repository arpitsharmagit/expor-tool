'use strict';

var _ = require('lodash');

var TimeUtil = {

	//Utility function to parse an ISO-8601 formatted date/time string
	/**
		Input: string. Example: 2013-03-31T04:11:08.860Z
		Returns: a date object
	*/
	parseUTCDate: function(string) {
		var R_ISO8601_STR = /^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d)(?::?(\d\d)(?::?(\d\d)(?:(\.\d+))?)?)?(Z|([+-])(\d\d):?(\d\d))?)?$/;
		                    // 1        2       3         4          5          6          7          8  9     10      11
		if(!string){
			return null;
		}

		if(string instanceof Date){
			return string;
		}

		var match = string.match(R_ISO8601_STR);
		if (match) {
			var date = new Date(0),
					tzHour = 0,
					tzMin	= 0,
					dateSetter = match[8] ? date.setUTCFullYear : date.setFullYear,
					timeSetter = match[8] ? date.setUTCHours : date.setHours;

			if (match[9]) {
				tzHour = parseInt(match[9] + match[10],10);
				tzMin = parseInt(match[9] + match[11],10);
			}
			var millis = match[7];
			if(millis){ //convert the fractional second into milliseconds
				millis = Math.floor( parseFloat(millis, 10) * 1000 );
			}
			dateSetter.call(date, parseInt(match[1],10), parseInt(match[2],10) - 1, parseInt(match[3],10));
			timeSetter.call(date, parseInt(match[4]||0,10) - tzHour, parseInt(match[5]||0,10) - tzMin, parseInt(match[6]||0, 10), millis);
			return date;
		}
		return null;
	},

	/**
		Returns a length of time in milliseconds
	**/
	parseCSharpTimespan: function(timeStr){
		if(typeof timeStr === 'number'){
			return timeStr;
		}

		//[-][d.]hh:mm:ss[.ffffff]
		var parts = /^(-)?(\d*\.)?(\d\d):(\d\d):(\d\d\.?\d*)$/.exec(timeStr);
		            // 1   2      3      4      5

		if(!parts){
			return;
		}

		var days = parseInt(parts[2])||0;
		var hours = parseInt(parts[3])||0;
		var minutes = parseInt(parts[4])||0;
		var seconds = parseFloat(parts[5])||0;

		hours += days * 24;
		minutes += hours * 60;
		seconds += minutes * 60;
		var millis = Math.floor(seconds * 1000);
		if(parts[1] === '-'){
			millis = -millis;
		}
		return millis;
	},

	//Formats number of milliseconds into a c# timespan string
	formatCSharpTimespan: function(timespan){
		var isNegative = timespan < 0;
		timespan = Math.abs(timespan);

		var fractionalSeconds = String((timespan % 1000)/1000);

		var t = Math.floor(timespan/1000);
		var seconds = (t % 60) ;
		var minutes = Math.floor(t/60)%60;
		var hours = Math.floor(t/3600)%24;
		var days = Math.floor(t/86400);

		return (isNegative ? '-' : '') +
			(days > 0 ? days + '.' : '') +
			pad2(hours) + ':' + pad2(minutes) + ":" + pad2(seconds) +
			(fractionalSeconds>0 ? fractionalSeconds.slice(fractionalSeconds.indexOf('.')) : '');

		//i: a number less than 100
		//returns i formatted with up to two leading zeros -> pad2(1) === '01'
		function pad2(i){
			return ("00"+i).slice(-2);
		}
	},

	formatTimespan: function(timespan, full){
		if(_.isString(timespan)){
			timespan = +timespan;
		}
		if(isNaN(timespan) || !_.isNumber(timespan) || timespan < 0){
			return "";
		}

		var t = Math.floor(timespan/1000);

		var seconds = t%60;
		var minutes = Math.floor(t/60)%60;
		var hours = Math.floor(t/3600);

		if(hours > 0 || full){
			return hours + ":" + pad2(minutes) + ":" + pad2(seconds);
		}
		else{
			return pad2(minutes) + ":" + pad2(seconds);
		}

		//i: a number less than 100
		//returns a 2-length string - the number with leading zeros
		function pad2(i){
			return ("00"+i).slice(-2);
		}
	},

	/**
	 *
	 * @param macAddress
	 * @returns a mac address with all special characters removed
	 */
	formatMacAddressNumbersOnly: function(macAddress) {
		return macAddress.replace(/[^0-9a-zA-Z]+/g,'').toUpperCase();
	},

};

module.exports = TimeUtil;
