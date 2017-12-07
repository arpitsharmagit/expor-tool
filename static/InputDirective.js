'use strict';

angular.module('migrateApp')

/**
 * Directive for all text inputs
 * Currently only handles inputs with type="text" but in theory it could be expanded to all inputs
 *
 * Usage:
 * <vb-input inline is-pristine="expr">
 *  <label>Label Text</label>
 *	<input name=".." ng-model=".." ...>  --or--  <select ...> --or-- <textarea ...>
 *	   --or-- <any-tag class="vb-input-field"></>
 *	<label validation="required"> This Field is Required</label>
 * 	<label validation ng-show="...">Custom error</label>
 * </vb-input>

	Attributes:
		inline : for use in form-inline style form
		is-pristine: default true,  If the expression evaluates to true then only show error/success styles for dirty fields.
					 Use this when the form is used for create/edit dual purpose

	Notes:
		* The "name" attribute is required for validation, and should be included on any input or select elements included
		  inside the directive.


 **/

.directive('vbInput', [function() {
	return {
		restrict: 'EA',
		compile: function(element, attr) {

			var inline = attr.inline || attr.inline === "";
			var form = element.parents('form, ng-form, [ng-form], .ng-form').first();
			var formName = form.attr("name") || form.attr('ng-form');
			var input = $($("input", element)[0] || $("select", element)[0] || $("textarea", element)[0] || $(".vb-input-field", element)[0]);
			var inputName = input.attr("name");
			var formAndInput = formName + '.' + inputName;
			var ngRequired = input.attr("ng-required");
			var isRequired = !!(input.attr("required") || ngRequired);
			var readOnly = !!input.attr('readonly') || input.attr('ng-readonly');
			var disabled = !!input.attr('disabled') || input.attr('ng-disabled');

			element.addClass("vb-input");

			var pristineExpression = "(" + (attr.isPristine ? "(" + attr.isPristine+ ") && " : "") +formAndInput + ".$pristine)";
			var requiredExpression = pristineExpression +
				(ngRequired ? " && (" + ngRequired  + ")" : "");
			var readOnlyExpression = readOnly ? '(' + readOnly + ')' : 'false'; //don't need to show validations for readonly or required fields
			var disabledExpression = disabled ? '(' + disabled + ')' : 'false';

			var formGroupNgClass= formAndInput ? ("{" +
				(isRequired ? "  'required': " + requiredExpression + "," : "") +
				"                'has-error': !" + pristineExpression + " && " + formAndInput + ".$invalid && !" + readOnlyExpression + " && !" + disabledExpression + "," +
				"                'has-success': !" + pristineExpression + " && " + formAndInput + ".$valid && !" + readOnlyExpression + " && !" + disabledExpression +
				"}") : "";


			var container = $('<div class="form-group"></div>').appendTo(element)
				.attr("ng-class", formGroupNgClass)
				.append(getMainLabel());

			var innerContainer = (inline ? container : $('<div class="row"></div>').appendTo($('<div class="col-sm-9"></div>').appendTo(container)))
					.append(getWrappedInput());

			if(isRequired){
				innerContainer
					.append('<div class="required-field"></div>');
			}

			var validationLabels = getValidationLabels();
			if(validationLabels.length){
				innerContainer
					.append('<div class="success-field"></div>')
					.append($('<div class="error-field"></div>').append(validationLabels));
			}


			innerContainer.children().toggleClass('col-sm-6', !inline);


			function getMainLabel(){
				return element.children("label:not([validation])")
					.addClass("control-label")
					.toggleClass("col-sm-3", !inline);
			}

			function getValidationLabels(){
				return $("label[validation]", element)
					.addClass("control-label")
					.each(function(){
						var label = $(this);
						var flag = label.attr("validation");

						if(flag){
							label.attr("ng-show", formAndInput+".$error."+flag);
						}
					});
			}

			function getWrappedInput(){

				//checkboxes, button groups dont work right with the form-control class
				if(!input.hasClass("vb-input-field")){
					input.addClass("form-control");
				}

				input = $($(".vb-input-wrap", element)[0] || input);

				if(inline){
					return input;
				}

				return $("<div></div>").append(input).append($(".help-block", element));
			}
		}
	};

}]);
