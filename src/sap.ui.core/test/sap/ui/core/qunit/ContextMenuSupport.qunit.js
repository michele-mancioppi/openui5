(function() {
	"use strict";

	jQuery.sap.require("sap.ui.qunit.qunit-css");
	jQuery.sap.require("sap.ui.thirdparty.qunit");
	jQuery.sap.require("sap.ui.qunit.qunit-junit");
	jQuery.sap.require("sap.ui.qunit.qunit-coverage");
	jQuery.sap.require("sap.ui.qunit.QUnitUtils");
	jQuery.sap.require("sap.ui.thirdparty.sinon");
	jQuery.sap.require("sap.ui.thirdparty.sinon-qunit");
	jQuery.sap.require("sap.ui.core.ContextMenuSupport");

	QUnit.module("ContextMenuSupport", {
		setup: function() {
			sap.ui.core.Control.extend("my.lib.MyControl", {
				metadata : {
					aggregations: { content: {type: "sap.ui.core.Control", multiple: false} }
				},

				renderer : function(oRenderManager, oControl) {
					oRenderManager.write("<span");
					oRenderManager.writeControlData(oControl);
					oRenderManager.write(">");
					oRenderManager.renderControl(oControl.getContent());
					oRenderManager.write("</span>");
				}
			});

			var MyMenuControl = sap.ui.core.Control.extend("my.lib.MyMenuControl", {
				metadata : {
					interfaces: [
						"sap.ui.core.IContextMenu"
					],
					aggregations: { content: {type: "sap.ui.core.Control", multiple: false} }
				},

				renderer : function(oRenderManager, oControl) {
					oRenderManager.write("<span></span>");
				}
			});
			MyMenuControl.prototype.openAsContextMenu = function(){};

			sap.ui.core.ContextMenuSupport.apply(my.lib.MyControl.prototype);

			this.myControl = new my.lib.MyControl("myControl");
			this.myMenuControl = new my.lib.MyMenuControl("myMenu");

			this.myControl.placeAt("qunit-fixture");
			sap.ui.getCore().applyChanges();
		},
		teardown: function() {
			this.myControl.destroy();
			this.myMenuControl.destroy();
		}
	});

	QUnit.test('Control has the new methods', function(assert) {
		assert.ok(this.myControl.setContextMenu, "Should have a setter for ContextMenu");
		assert.ok(this.myControl.getContextMenu, "Should have a getter for ContextMenu");
	});

	QUnit.test('setContextMenu twice should open the second menu', function(assert) {
		var oOpenStub = sinon.stub(my.lib.MyMenuControl.prototype, "openAsContextMenu"),
			oSecondMenuControl = this.myMenuControl.clone();

		this.myControl.setContextMenu(this.myMenuControl);
		this.myControl.setContextMenu(oSecondMenuControl);
		sap.ui.test.qunit.triggerMouseEvent(this.myControl.getDomRef(), "contextmenu");

		assert.notOk(oOpenStub.calledOn(this.myMenuControl), "first menu should not be opened");
		assert.ok(oOpenStub.calledOn(oSecondMenuControl), "second menu should be opened");

		oOpenStub.restore();
		oSecondMenuControl.destroy();
	});

	QUnit.test("setContextMenu with null should remove the Context Menu", function(assert) {
		var oOpenStub = sinon.stub(my.lib.MyMenuControl.prototype, "openAsContextMenu");

		this.myControl.setContextMenu(this.myMenuControl);
		this.myControl.setContextMenu(null);

		sap.ui.test.qunit.triggerMouseEvent(this.myControl.getDomRef(), "contextmenu");

		assert.notOk(oOpenStub.calledOn(this.myMenuControl), "first menu should not be opened");

		oOpenStub.restore();
	});

	QUnit.test("addEventDelegate should be called", function(assert) {
		var oAddEventDelegateStub = sinon.stub(my.lib.MyControl.prototype, "addEventDelegate");

		this.myControl.setContextMenu(this.myMenuControl);

		assert.ok(oAddEventDelegateStub.called, "Delegate should be added");

		oAddEventDelegateStub.restore();
	});

	QUnit.test("addEventDelegate should not be called", function(assert) {
		var oFakeMenu = { "fake": "object" },
			oAddEventDelegateStub = sinon.stub(my.lib.MyControl.prototype, "addEventDelegate");

		this.myControl.setContextMenu(oFakeMenu);

		assert.notOk(oAddEventDelegateStub.called, "Delegate should not be added");

		oAddEventDelegateStub.restore();
		oFakeMenu = null;
	});

	QUnit.test("addEventDelegate should not be called on elements that do not implement IContextMenu", function(assert) {
		sap.ui.core.Element.extend("my.lib.MyElement", {
			metadata : {}
		});

		sap.ui.core.ContextMenuSupport.apply(my.lib.MyElement.prototype);

		var oElement = new my.lib.MyElement("oElement");

		assert.notOk(oElement.setContextMenu, "Should not have a setter for ContextMenu");
		assert.notOk(oElement.getContextMenu, "Should not have a getter for ContextMenu");

		oElement.destroy();
	});

	QUnit.test("oncontextmenu should open ContextMenu", function(assert) {
		var oFakeEvent = jQuery.Event("oncontextmenu", { srcControl:  this.myControl }),
			oOpenStub = sinon.stub(my.lib.MyMenuControl.prototype, "openAsContextMenu");

		this.myControl.setContextMenu(this.myMenuControl);
		sap.ui.test.qunit.triggerMouseEvent(this.myControl.getDomRef(), "contextmenu");

		assert.ok(oOpenStub.called, "open should be called");

		delete oFakeEvent.srcControl;
		oFakeEvent = null;
		oOpenStub.restore();
	});

	QUnit.test("getContextMenu should return the ContextMenu", function(assert) {
		this.myControl.setContextMenu(this.myMenuControl);

		assert.strictEqual(this.myControl.getContextMenu(), this.myMenuControl, "ContextMenu should be returned");
	});
})();
