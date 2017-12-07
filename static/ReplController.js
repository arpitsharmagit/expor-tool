'use strict';
/* global angular, migrateApp, _ */

(function( ng, migrateApp ) {
  migrateApp.controller('ReplController', ['$scope', '$rootScope', '$window', 'EventChannelService', function ($scope, $rootScope, $window, EventChannelService) {
  var editor, $output, $logview;

  $scope.inputOptions = {
      lineNumbers: false,
      lineWrapping: true,
      mode: 'javascript',
      theme: 'neat',
      extraKeys: {
        'Ctrl-Enter': execute
      }
  };
  $scope.outputOptions = {
    lineNumbers: false,
    lineWrapping: false,
    mode: 'javascript',
    theme: 'neat',
    readOnly: true,
    maxLines: 100,
    maxSpans: 100,
    maxCharacters: 4092
  };

  $scope.logLevel = 'debug';
  $scope.maxLogLines = 1000;
  $scope.log = function (message) {
    var scrollView = $logview[0],
        shouldScroll = scrollView.scrollTop >= (scrollView.scrollHeight - scrollView.offsetHeight * 1.25);

    var html = '<code class="log-line-{{message.severity}}"><span class="label label-primary  log-domain">{{message.domain}}</span>: {{message.data}}'
            .replace('{{message.severity}}', message.severity || '')
            .replace('{{message.domain}}', message.domain || '')
            .replace('{{message.data}}', prettyPrintJSON(message.data || '')),
        $el = $('<li>' + html + '</li>');
    $el.appendTo($logview);

    $logview.find('li').slice(0, -1 * $scope.maxLogLines).remove();

    if (shouldScroll) {
      scrollView.scrollTop = scrollView.scrollHeight;
    }

  };
  EventChannelService.on('log', $scope.log);

  $scope.replInputLoaded = function (_editor) {
    editor = _editor;
    $output = $('#repl-output');
    $logview = $output;
  };

  function execute () {
    //var text = $input.getLine(line);
    var text = editor.somethingSelected() ? editor.getSelection() : editor.getValue(),
        maxDepth = 1;

    EventChannelService.send('repl', text, maxDepth)
      .then(function (result) {
        displayResult(result);
      })
      .catch(function (error) {
        console.warn(error);
        displayResult({ error: error });
      });
  }

  function displayResult(result) {
    var html,
        maxLines = $scope.outputOptions.maxLines,
        maxSpans = $scope.outputOptions.maxSpans,
        maxCharacters = $scope.outputOptions.maxCharacters;

    var scrollView = $output[0],
        shouldScroll = scrollView.scrollTop >= (scrollView.scrollHeight - scrollView.offsetHeight * 1.5);

    if (result.error) {
      console.error('REPL:', result.error);
      html = '<pre class="repl-error">' + result.error.message + '</pre>';
    } else {
      if (!result.output || result.output === 'undefined') {
        html = '<span class="text-muted">undefined</span>';
      } else {
        console.log('REPL:', result.error || result.output);
        html = '<pre class="repl-line">' + prettyPrintJSON(result.output) + '</pre>';
      }
    }

    var $el = $('<li>' + html + '</li>');

    /*if (html.length > maxCharacters * 8) {
      console.warn('limiting output JSON length');
      $el.find('span').slice(0, -1 * maxSpans).remove();
    }*/

    $el.appendTo($output);


    // remove old lines
    $output.find('li').slice(0, -1 * maxLines).remove();

    if (shouldScroll) {
      scrollView.scrollTop = scrollView.scrollHeight;
    }
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
          r = r + (pVal[0] === '"' ? str : val) + pVal + '</span>';
        }
        return r + (pEnd || '');
      }

      return function (obj) {
        var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
        try {
         return JSON.stringify(obj, null, 3)
                  .replace(/&/g, '&amp;').replace(/\\"/g, '&quot;')
                  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(jsonLine, replacer)
                  .replace(/^(\{|\[)\n/, '$1 ')
                  .replace(/\n(\}|\])$/, ' $1');
        } catch (err) {
          return '' + obj;
        }
      };
   })();



}]);
})(angular, migrateApp);
