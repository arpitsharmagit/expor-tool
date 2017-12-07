'use strict';
/* global angular */

var app = angular.module('x', ['ui.codemirror']);

app.controller('ReplController', [ '$scope', function ($scope) {
  var editor, $output;
console.log('hello!', $scope);
  $scope.inputOptions = {
      lineNumbers: true,
      lineWrapping: true,
      mode: 'javascript',
      theme: 'blackboard',
      extraKeys: {
        'Ctrl-Enter': execute
      }
  };
  $scope.outputOptions = {
    lineNumbers: false,
    lineWrapping: true,
    mode: 'javascript',
    theme: 'blackboard',
    readOnly: true
  };

  $scope.replInputLoaded = function (_editor) {
    editor = _editor;
    $output = document.querySelector('#output');
  };

  function execute () {
    //var text = $input.getLine(line);
    var text = editor.somethingSelected() ? editor.getSelection() : editor.getValue();

    $.ajax({
      type: "POST",
      url: 'http://localhost:8089/repl',
      data: { code: text },
      dataType: 'json'
    }).done(function (result) {
      displayResult(result);
    }).fail(function (xhr, error) {
      displayResult({ error: { code: xhr.status, message: xhr.statusText }});
    });

  }

   /*
    result = {
      time
      title,
      name
      args
    }
   */
   function displayResult (result) {
     var html;
     console.log(result);
     if (result.error) {
       html = '<pre class="repl-error">' + result.error.message + '</pre>';
     } else {
       html = '<pre class="repl-line">' + prettyPrintJSON(result.output) + '</pre>';
     }
     $output.insertAdjacentHTML('beforeEnd', '<li>' + html + '</li>');
   }

   var prettyPrintJSON = (function () {
     function replacer (match, pIndent, pKey, pVal, pEnd) {
        var key = '<span class=cm-variable json-key>';
        var val = '<span class=cm-number json-value>';
        var str = '<span class=cm-string json-string>';
        var r = pIndent || '';
        if (pKey) {
          r = r + key + pKey.replace(/[": ]/g, '') + '</span>: ';
        }
        if (pVal) {
          r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
        }
        return r + (pEnd || '');
      }

      return function (obj) {
         var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
         return JSON.stringify(obj, null, 3)
            .replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(jsonLine, replacer);
      }
   })();



}]);
