'use strict';

var _ = require('lodash');

var FileUtil = {

	imageFileExtensions: ['jpg', 'gif', 'png', 'svg'],
	isImageFile: function (extension) {
		return _.contains(this.imageFileExtensions, extension);
	},

	videoFileExtensions: ['avi', 'm4v', 'f4v', 'flv', 'swf', 'mpg', 'ts', 'mp4', 'avi', 'wmv', 'asf', 'mov', 'mkv'],
	isVideoFile: function (extension) {
		return _.contains(this.videoFileExtensions, extension);
	},

	presentationFileExtensions: ['ppt', 'pptx'],
	isPresentationFile: function (extension){
		return _.contains(this.presentationFileExtensions, extension);
	},

	documentFileExtensions: ['doc', 'docx', 'txt', 'pdf'],
	isDocumentFile: function (extension) {
		return _.contains(this.documentFileExtensions, extension);
	},

	spreadsheetFileExtensions: ['xls', 'xlsx', 'csv'],
	isSpreadsheetFile: function (extension) {
		return _.contains(this.spreadsheetFileExtensions, extension);
	},

	archiveFileExtensions: ['zip', 'rar', '7z'],
	isArchiveFile: function (extension) {
		return _.contains(this.archiveFileExtensions, extension);
	},

	parseFileName: function(fileName){
		var matches = /^(.*)\.([^.]*)$/.exec(fileName);
		if(matches){
			return {
				prettyName: matches[1],
				extension: matches[2].toLowerCase()
			};
		}
	},

	formatFileSize: function (size, numDecimalPlaces) {
		if (_.isString(size)) {
			size = parseInt(size, 10);
		}
		if (size < 0 || (size !== 0 && !size)) {
			return size;
		}


		var units = [
			' Bytes', 'KB', 'MB', 'GB', 'TB' //...
		];


		for (var i = 0, len = units.length - 1; i < len; i++) {
			if (size < 1024) {
				break;
			}
			size /= 1024;
		}

		numDecimalPlaces = numDecimalPlaces || 2;
		var tens = Math.pow(10, numDecimalPlaces);

		return Math.floor(size * tens) / tens + '' + units[i];
	}
};

module.exports = FileUtil;
