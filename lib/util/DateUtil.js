'use strict';

var DateUtil = {
	fromTimestamp: function(t){
		var d = new Date();
		d.setTime(t);
		return d;
	},

	getToday: function(){
		return this.getStartOfDay();
	},
	getYesterday: function(){
		return this.getStartOfDay(this.addDays(new Date(), -1));
	},

	///returns a new Date set to the beginning of the given day/week/month/year
	//d:  a date object or null. If null then current time is used.
	getStartOfDay: function(d){
		d = d ? new Date(d.getTime()) : new Date();
		d.setMilliseconds(0);
		d.setSeconds(0);
		d.setMinutes(0);
		d.setHours(0);
		return d;
	},

	//returns current time of day in ms.
	getTimeOfDay: function(d){
		return d.getTime() - this.getStartOfDay(d).getTime();
	},

	getStartOfWeek: function(d){
		d = this.getStartOfDay(d);
		d.setDate(d.getDate() - d.getDay());
		return d;
	},
	getStartOfMonth: function(d){
		d = this.getStartOfDay(d);
		d.setDate(1);
		return d;
	},
	getStartOfYear: function(d){
		d = this.getStartOfMonth();
		d.setMonth(0);
		return d;
	},

	addHours: function(date, numHours){
		var d = new Date(date.getTime());
		d.setHours(d.getHours() + numHours);
		return d;
	},

	addDays: function(date, numDays){
		var d = new Date(date.getTime());
		d.setDate(d.getDate() + numDays);
		return d;
	},
	addMonths: function(date, numMonths){
		var d = new Date(date.getTime());
		d.setMonth(d.getMonth() + numMonths);
		return d;
	},
	addYears: function(date, numYears){
		var d = new Date(date.getTime());
		d.setFullYear(d.getFullYear() + numYears);
		return d;
	},

	daysBetween: function(d1, d2){
		var day = 24 * 60 * 60 * 1000;
		var delta = (d1.getTime() - d2.getTime())/day;
		return Math.round(delta);
	},

	daysInMonth: function(date){
		var d = new Date(date.getFullYear(), date.getMonth()+1, 0);
		return d.getDate();
	},

	daysInMonthOfYear: function(year, month){
		var d = new Date(year, month+1, 0);
		return d.getDate();
	},

	//gets the UTC Offset in ms
	getOffset: function(date){
		return -date.getTimezoneOffset() * 60 * 1000;
	}
};

module.exports = DateUtil;
