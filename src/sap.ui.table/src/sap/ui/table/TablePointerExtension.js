/*!
 * ${copyright}
 */

// Provides helper sap.ui.table.TablePointerExtension.
sap.ui.define(['jquery.sap.global', './TableExtension', './TableUtils', 'sap/ui/Device', 'sap/ui/core/Popup', 'jquery.sap.dom'],
	function(jQuery, TableExtension, TableUtils, Device, Popup, jQueryDom) {
	"use strict";

	/*
	 * Provides utility functions used this extension
	 */
	var ExtensionHelper = {

		/*
		 * Returns the pageX and pageY position of the given mouse/touch event.
		 */
		_getEventPosition : function(oEvent, oTable) {
			var oPos;
			if (oTable._isTouchMode(oEvent)) {
				oPos = oEvent.targetTouches ? oEvent.targetTouches[0] : oEvent.originalEvent.targetTouches[0];
			} else {
				oPos = oEvent;
			}
			return {x: oPos.pageX, y: oPos.pageY};
		}

	};

	/*
	 * Provides helper functionality (e.g. drag&drop capabilities) for column resizing.
	 */
	var ColumnResizeHelper = {

		/*
		 * Initializes the drag&drop for resizing
		 */
		initColumnResizing : function(oTable, oEvent){
			if (oTable._bIsColumnResizerMoving) {
				return;
			}

			oTable._bIsColumnResizerMoving = true;
			oTable.$().toggleClass("sapUiTableResizing", true);

			var $Document = jQuery(document),
				bTouch = oTable._isTouchMode(oEvent);

			oTable._$colResize = oTable.$("rsz");
			oTable._iColumnResizeStart = ExtensionHelper._getEventPosition(oEvent, oTable).x;

			$Document.bind((bTouch ? "touchend" : "mouseup") + ".sapUiTableColumnResize", ColumnResizeHelper.exitColumnResizing.bind(oTable));
			$Document.bind((bTouch ? "touchmove" : "mousemove") + ".sapUiTableColumnResize", ColumnResizeHelper.onMouseMoveWhileColumnResizing.bind(oTable));

			oTable._disableTextSelection();
		},

		/*
		 * Drops the previous dragged column resize bar and recalculates the new column width.
		 */
		exitColumnResizing: function(oEvent) {
			ColumnResizeHelper._resizeColumn(this, this._iLastHoveredColumnIndex);
		},

		/*
		 * Handler for the move events while dragging the column resize bar.
		 */
		onMouseMoveWhileColumnResizing: function(oEvent) {
			var iLocationX = ExtensionHelper._getEventPosition(oEvent, this).x;

			if (this._iColumnResizeStart && iLocationX < this._iColumnResizeStart + 3 && iLocationX > this._iColumnResizeStart - 3) {
				return;
			}

			if (this._isTouchMode(oEvent)) {
				oEvent.stopPropagation();
				oEvent.preventDefault();
			}

			this._$colResize.toggleClass("sapUiTableColRszActive", true);

			var oColumn = this._getVisibleColumns()[this._iLastHoveredColumnIndex];
			var iDeltaX = iLocationX - this._iColumnResizeStart;
			var iWidth = Math.max(oColumn.$().width() + iDeltaX * (this._bRtlMode ? -1 : 1), this._iColMinWidth);

			// calculate and set the position of the resize handle
			var iRszOffsetLeft = this.$().find(".sapUiTableCnt").offset().left;
			var iRszLeft = Math.floor((iLocationX - iRszOffsetLeft) - (this._$colResize.width() / 2));
			this._$colResize.css("left", iRszLeft + "px");

			// store the width of the column to apply later
			oColumn._iNewWidth = iWidth;
		},

		/*
		 * Cleans up the state which is created while resize a column via drag&drop.
		 */
		_cleanupColumResizing: function(oTable) {
			if (oTable._$colResize) {
				oTable._$colResize.toggleClass("sapUiTableColRszActive", false);
				oTable._$colResize = null;
			}
			oTable._iColumnResizeStart = null;
			oTable._bIsColumnResizerMoving = false;
			oTable.$().toggleClass("sapUiTableResizing", false);
			oTable._enableTextSelection();

			var $Document = jQuery(document);
			$Document.unbind("touchmove.sapUiTableColumnResize");
			$Document.unbind("touchend.sapUiTableColumnResize");
			$Document.unbind("mousemove.sapUiTableColumnResize");
			$Document.unbind("mouseup.sapUiTableColumnResize");
		},

		/*
		 * Cleans up the state which is created while resize a column via drag&drop and recalculates the new column width.
		 */
		_resizeColumn: function(oTable, iColIndex) {
			var aVisibleColumns = oTable._getVisibleColumns(),
				oColumn,
				bResized = false;

			if (iColIndex >= 0 && iColIndex < aVisibleColumns.length) {
				oColumn = aVisibleColumns[iColIndex];
				if (oColumn._iNewWidth) {
					var sWidth;
					var iAvailableSpace = oTable.$().find(".sapUiTableCtrl").width();
					if (!oTable._checkPercentageColumnWidth()) {
						sWidth = oColumn._iNewWidth + "px";
					} else {
						var iColumnWidth = Math.round(100 / iAvailableSpace * oColumn._iNewWidth);
						sWidth = iColumnWidth + "%";
					}

					if (oTable._updateColumnWidth(oColumn, sWidth, true)) {
						oTable._resizeDependentColumns(oColumn, sWidth);
					}

					delete oColumn._iNewWidth;
					bResized = true;
				}
			}

			ColumnResizeHelper._cleanupColumResizing(oTable);

			oColumn.focus();

			// rerender if size of the column was changed
			if (bResized) {
				oTable.invalidate();
			}
		},

		/*
		 * Computes the optimal width for a column and changes the width if the auto resize feature is activated for the column.
		 *
		 * Experimental feature.
		 */
		doAutoResizeColumn : function(oTable, iColIndex) {
			var aVisibleColumns = oTable._getVisibleColumns(),
				oColumn;

			if (iColIndex >= 0 && iColIndex < aVisibleColumns.length) {
				oColumn = aVisibleColumns[iColIndex];
				if (!oColumn.getAutoResizable() || !oColumn.getResizable()) {
					return;
				}

				var iNewWidth = ColumnResizeHelper._calculateAutomaticColumnWidth.apply(oTable, [oColumn, iColIndex]);
				if (iNewWidth) {
					oColumn._iNewWidth = iNewWidth;
					ColumnResizeHelper._resizeColumn(oTable, iColIndex);
				}
			}
		},

		/*
		 * Calculates the widest content width of the column
		 * also takes the column header and potential icons into account
		 * @param {int} iColIndex index of the column which should be resized
		 * @return {int} minWidth minimum width the column needs to have
		 *
		 * Note: Experimental, only works with a limited control set
		 *
		 * TBD: Cleanup this function and find a proper mechanismn
		 */
		_calculateAutomaticColumnWidth : function(oCol, iColIndex) {
			function checkIsTextControl(oControl) {
				var aTextBasedControls = [
					"sap/m/Text",
					"sap/m/Label",
					"sap/m/Link",
					"sap/m/Input",
					"sap/ui/commons/TextView",
					"sap/ui/commons/Label",
					"sap/ui/commons/Link",
					"sap/ui/commons/TextField"
				];
				var bIsTextBased = false;
				for (var i = 0; i < aTextBasedControls.length; i++) {
					bIsTextBased = bIsTextBased || TableUtils.isInstanceOf(oControl, aTextBasedControls[i]);
				}
				if (!bIsTextBased && typeof TablePointerExtension._fnCheckTextBasedControl === "function" && TablePointerExtension._fnCheckTextBasedControl(oControl)) {
					bIsTextBased = true;
				}
				return bIsTextBased;
			}

			var $this = this.$();
			var iHeaderWidth = 0;
			var $cols = $this.find('td[headers=\"' + this.getId() + '_col' + iColIndex + '\"]').children("div");
			var aHeaderSpan = oCol.getHeaderSpan();
			var oColLabel = oCol.getLabel();
			var oColTemplate = oCol.getTemplate();
			var bIsTextBased = checkIsTextControl(oColTemplate);

			var hiddenSizeDetector = document.createElement("div");
			document.body.appendChild(hiddenSizeDetector);
			jQuery(hiddenSizeDetector).addClass("sapUiTableHiddenSizeDetector");

			var oColLabels = oCol.getMultiLabels();
			if (oColLabels.length == 0 && !!oColLabel){
				oColLabels = [oColLabel];
			}

			if (oColLabels.length > 0) {
				jQuery.each(oColLabels, function(iIdx, oLabel){
					var iHeaderSpan;
					if (!!oLabel.getText()){
						jQuery(hiddenSizeDetector).text(oLabel.getText());
						iHeaderWidth = hiddenSizeDetector.scrollWidth;
					} else {
						iHeaderWidth = oLabel.$().scrollWidth;
					}
					iHeaderWidth = iHeaderWidth + $this.find("#" + oCol.getId() + "-icons").first().width();

					$this.find(".sapUiTableColIcons#" + oCol.getId() + "_" + iIdx + "-icons").first().width();
					if (aHeaderSpan instanceof Array && aHeaderSpan[iIdx] > 1){
						iHeaderSpan = aHeaderSpan[iIdx];
					} else if (aHeaderSpan > 1){
						iHeaderSpan = aHeaderSpan;
					}
					if (!!iHeaderSpan){
						// we have a header span, so we need to distribute the width of this header label over more than one column
						//get the width of the other columns and subtract from the minwidth required from label side
						var i = iHeaderSpan - 1;
						while (i > iColIndex) {
							iHeaderWidth = iHeaderWidth - (this._getVisibleColumns()[iColIndex + i].$().width() || 0);
							i -= 1;
						}
					}
				});
			}

			var minAddWidth = Math.max.apply(null, $cols.map(
				function(){
					var _$this = jQuery(this);
					return parseInt(_$this.css('padding-left'), 10) + parseInt(_$this.css('padding-right'), 10)
							+ parseInt(_$this.css('margin-left'), 10) + parseInt(_$this.css('margin-right'), 10);
				}).get());

			//get the max width of the currently displayed cells in this column
			var minWidth = Math.max.apply(null, $cols.children().map(
				function() {
					var width = 0,
					sWidth = 0;
					var _$this = jQuery(this);
					var sColText = _$this.text() || _$this.val();

					if (bIsTextBased){
						jQuery(hiddenSizeDetector).text(sColText);
						sWidth = hiddenSizeDetector.scrollWidth;
					} else {
						sWidth = this.scrollWidth;
					}
					if (iHeaderWidth > sWidth){
						sWidth = iHeaderWidth;
					}
					width = sWidth + parseInt(_$this.css('margin-left'), 10)
											+ parseInt(_$this.css('margin-right'), 10)
											+ minAddWidth
											+ 1; // ellipsis is still displayed if there is an equality of the div's width and the table column
					return width;
				}).get());

			jQuery(hiddenSizeDetector).remove();
			return Math.max(minWidth, this._iColMinWidth);
		},

		/*
		 * Initialize the event listener for positioning the column resize bar and computing the currently hovered column.
		 */
		initColumnTracking : function(oTable) {
			// attach mousemove listener to update resizer position
			oTable.$().find(".sapUiTableCtrlScr, .sapUiTableCtrlScrFixed, .sapUiTableColHdrScr, .sapUiTableColHdrFixed").mousemove(function(oEvent){
				var oDomRef = this.getDomRef();
				if (!oDomRef || this._bIsColumnResizerMoving) {
					return;
				}

				var iPositionX = oEvent.clientX,
					iTableRect = oDomRef.getBoundingClientRect(),
					iLastHoveredColumn = 0,
					iResizerPositionX = this._bRtlMode ? 10000 : -10000;

				for (var i = 0; i < this._aTableHeaders.length; i++) {
					var oTableHeaderRect = this._aTableHeaders[i].getBoundingClientRect();
					if (this._bRtlMode) {
						// 5px for resizer width
						if ((iPositionX < oTableHeaderRect.right - 5) && (iPositionX >= oTableHeaderRect.left)) {
							iLastHoveredColumn = i;
							iResizerPositionX = oTableHeaderRect.left - iTableRect.left;
							break;
						}
					} else {
						// 5px for resizer width
						if ((iPositionX > oTableHeaderRect.left + 5) && (iPositionX <= oTableHeaderRect.right)) {
							iLastHoveredColumn = i;
							iResizerPositionX = oTableHeaderRect.right - iTableRect.left;
							break;
						}
					}
				}

				var oColumn = this._getVisibleColumns()[iLastHoveredColumn];
				if (oColumn && oColumn.getResizable()) {
					this.$("rsz").css("left", iResizerPositionX + "px");
					this._iLastHoveredColumnIndex = iLastHoveredColumn;
				}
			}.bind(oTable));
		}

	};



	/*
	 * Provides drag&drop resize capabilities for visibleRowCountMode "Interactive".
	 */
	var InteractiveResizeHelper = {

		/*
		 * Initializes the drag&drop for resizing
		 */
		initInteractiveResizing: function(oTable, oEvent){
			var $Body = jQuery(document.body),
				$Splitter = oTable.$("sb"),
				$Document = jQuery(document),
				offset = $Splitter.offset(),
				height = $Splitter.height(),
				width = $Splitter.width(),
				bTouch = oTable._isTouchMode(oEvent);

			// Fix for IE text selection while dragging
			$Body.bind("selectstart", InteractiveResizeHelper.onSelectStartWhileInteractiveResizing);

			$Body.append(
				"<div id=\"" + oTable.getId() + "-ghost\" class=\"sapUiTableInteractiveResizerGhost\" style =\" height:" + height + "px; width:"
				+ width + "px; left:" + offset.left + "px; top:" + offset.top + "px\" ></div>");

			// Append overlay over splitter to enable correct functionality of moving the splitter
			$Splitter.append("<div id=\"" + oTable.getId() + "-rzoverlay\" style =\"left: 0px; right: 0px; bottom: 0px; top: 0px; position:absolute\" ></div>");

			$Document.bind((bTouch ? "touchend" : "mouseup") + ".sapUiTableInteractiveResize", InteractiveResizeHelper.exitInteractiveResizing.bind(oTable));
			$Document.bind((bTouch ? "touchmove" : "mousemove") + ".sapUiTableInteractiveResize", InteractiveResizeHelper.onMouseMoveWhileInteractiveResizing.bind(oTable));

			oTable._disableTextSelection();
		},

		/*
		 * Drops the previous dragged horizontal splitter bar and recalculates the amount of rows to be displayed.
		 */
		exitInteractiveResizing : function(oEvent) {
			var $Body = jQuery(document.body),
				$Document = jQuery(document),
				$This = this.$(),
				$Ghost = this.$("ghost"),
				iLocationY = ExtensionHelper._getEventPosition(oEvent, this).y;

			var iNewHeight = iLocationY - $This.find(".sapUiTableCCnt").offset().top - $Ghost.height() - $This.find(".sapUiTableFtr").height();

			// TBD: Move this to the table code
			this._setRowContentHeight(iNewHeight);
			this._adjustRows(this._calculateRowsToDisplay(iNewHeight));

			$Ghost.remove();
			this.$("rzoverlay").remove();

			$Body.unbind("selectstart", InteractiveResizeHelper.onSelectStartWhileInteractiveResizing);
			$Document.unbind("touchend.sapUiTableInteractiveResize");
			$Document.unbind("touchmove.sapUiTableInteractiveResize");
			$Document.unbind("mouseup.sapUiTableInteractiveResize");
			$Document.unbind("mousemove.sapUiTableInteractiveResize");

			this._enableTextSelection();
		},

		/*
		 * Handler for the selectstart event triggered in IE to select the text. Avoid this during resize drag&drop.
		 */
		onSelectStartWhileInteractiveResizing : function(oEvent) {
			oEvent.preventDefault();
			oEvent.stopPropagation();
			return false;
		},

		/*
		 * Handler for the move events while dragging the horizontal resize bar.
		 */
		onMouseMoveWhileInteractiveResizing : function(oEvent) {
			var iLocationY = ExtensionHelper._getEventPosition(oEvent, this).y;
			var iMin = this.$().offset().top;
			if (iLocationY > iMin) {
				this.$("ghost").css("top", iLocationY + "px");
			}
		}

	};



	/*
	 * Provides drag&drop capabilities for column reordering.
	 */
	var ReorderHelper = {

		/*
		 * Initializes the drag&drop for reordering
		 */
		initReordering: function(oTable, iColIndex, oEvent) {
			var oColumn = oTable.getColumns()[iColIndex],
				$Col = oColumn.$(),
				$Table = oTable.$();


			oTable._disableTextSelection();
			$Table.addClass("sapUiTableDragDrop");

			// Initialize the Ghost
			var $Ghost = $Col.clone();
			$Ghost.find('*').addBack($Ghost).removeAttr("id")
				.removeAttr("data-sap-ui")
				.removeAttr("tabindex");
			$Ghost.attr("id", oTable.getId() + "-roghost")
				.addClass("sapUiTableColReorderGhost")
				.css({
					"left": -10000,
					"top": -10000,
					"z-index": Popup.getNextZIndex()
				});
			$Ghost.toggleClass(TableUtils.getContentDensity(oTable), true);
			$Ghost.appendTo(document.body);
			oTable._$ReorderGhost = oTable.getDomRef("roghost");

			// Fade out whole column
			$Table.find("td[data-sap-ui-colid='" + oColumn.getId() + "']").toggleClass("sapUiTableColReorderFade", true);

			// Initialize the Indicator where to insert
			var $Indicator = jQuery("<div id='" + oTable.getId() + "-roind' class='sapUiTableColReorderIndicator'><div class='sapUiTableColReorderIndicatorArrow'></div><div class='sapUiTableColReorderIndicatorInner'></div></div>");
			$Indicator.appendTo(oTable.getDomRef("sapUiTableCnt"));
			oTable._$ReorderIndicator = oTable.getDomRef("roind");

			// Collect the needed column information
			oTable._iDnDColIndex = iColIndex;

			// Bind the event handlers
			var $Document = jQuery(document),
				bTouch = oTable._isTouchMode(oEvent);
			$Document.bind((bTouch ? "touchend" : "mouseup") + ".sapUiColumnMove", ReorderHelper.exitReordering.bind(oTable));
			$Document.bind((bTouch ? "touchmove" : "mousemove") + ".sapUiColumnMove", ReorderHelper.onMouseMoveWhileReordering.bind(oTable));
		},

		/*
		 * Handler for the move events while dragging for reordering.
		 * Reposition the ghost.
		 */
		onMouseMoveWhileReordering : function(oEvent) {
			var oEventPosition = ExtensionHelper._getEventPosition(oEvent, this),
				iLocationX = oEventPosition.x,
				iLocationY = oEventPosition.y,
				iOldColPos = this._iNewColPos;

			this._iNewColPos = this._iDnDColIndex;

			var oPos = ReorderHelper.findColumnForPosition(this, iLocationX);

			// do scroll if needed
			var iScrollTriggerAreaWidth = 40,
				oScrollArea = this.getDomRef("sapUiTableCtrlScr"),
				$ScrollArea = jQuery(oScrollArea),
				oScrollAreaRect = oScrollArea.getBoundingClientRect(),
				iScrollAreaWidth = $ScrollArea.outerWidth(),
				iScrollAreaScrollLeft = this._bRtlMode ? $ScrollArea.scrollLeftRTL() : $ScrollArea.scrollLeft();

			this._bReorderScroll = false;

			if (iLocationX > oScrollAreaRect.left + iScrollAreaWidth - iScrollTriggerAreaWidth
					&& iScrollAreaScrollLeft + iScrollAreaWidth < oScrollArea.scrollWidth) {
				this._bReorderScroll = true;
				ReorderHelper.doScroll(this, !this._bRtlMode);
				ReorderHelper.adaptReorderMarkerPosition(this, oPos, false);
			} else if (iLocationX < oScrollAreaRect.left + iScrollTriggerAreaWidth
					&& iScrollAreaScrollLeft > 0) {
				this._bReorderScroll = true;
				ReorderHelper.doScroll(this, this._bRtlMode);
				ReorderHelper.adaptReorderMarkerPosition(this, oPos, false);
			}

			// update the ghost position
			jQuery(this._$ReorderGhost).css({
				"left": iLocationX + 5,
				"top": iLocationY + 5
			});

			if (this._bReorderScroll || !oPos) {
				return;
			}

			// calculate the new position
			var iSpan = ReorderHelper.getHeaderSpan(sap.ui.getCore().byId(oPos.id));

			if (oPos.before) {
				this._iNewColPos = oPos.index;
			} else if (oPos.after) {
				this._iNewColPos = oPos.index + iSpan;
			}

			if (oPos.index > this._iDnDColIndex || (oPos.index == this._iDnDColIndex && oPos.after)) {
				this._iNewColPos--;
			}

			if (!ReorderHelper.isColumnReorderable(this, this._iNewColPos)) { // prevent the reordering of the fixed columns
				this._iNewColPos = iOldColPos;
			} else {
				ReorderHelper.adaptReorderMarkerPosition(this, oPos, true);
			}
		},

		/*
		 * Ends the column reordering process via drag&drop.
		 */
		exitReordering : function(oEvent) {
			var iOldIndex = this._iDnDColIndex,
				iNewIndex = this._iNewColPos;

			// Unbind the event handlers
			var $Document = jQuery(document);
			$Document.unbind("touchmove.sapUiColumnMove");
			$Document.unbind("touchend.sapUiColumnMove");
			$Document.unbind("mousemove.sapUiColumnMove");
			$Document.unbind("mouseup.sapUiColumnMove");

			this._bReorderScroll = false;

			// Cleanup globals
			this.$().removeClass("sapUiTableDragDrop");
			delete this._iDnDColIndex;
			delete this._iNewColPos;

			jQuery(this._$ReorderGhost).remove();
			delete this._$ReorderGhost;
			jQuery(this._$ReorderIndicator).remove();
			delete this._$ReorderIndicator;
			this.$().find(".sapUiTableColReorderFade").removeClass("sapUiTableColReorderFade");

			this._enableTextSelection();

			// Perform Reordering
			ReorderHelper.performReordering(this, iOldIndex, iNewIndex, oEvent);

			// For AnalyticalTable only
			if (this.updateAnalyticalInfo) {
				this.updateAnalyticalInfo(true, true);
			}
		},

		/*
		 * Does the column reordering.
		 * TBD: Externalize this to be reusable (e.g. keyboard support)
		 */
		performReordering : function(oTable, iOldIndex, iNewIndex, oEvent) {
			var oDnDCol = oTable.getColumns()[iOldIndex];

			// forward the event
			var bExecuteDefault = oTable.fireColumnMove({
				column: oDnDCol,
				newPos: iNewIndex
			});

			var bMoveRight = iOldIndex < iNewIndex;

			if (bExecuteDefault && iNewIndex !== undefined && iNewIndex !== iOldIndex) {
				oTable.removeColumn(oDnDCol);
				oTable.insertColumn(oDnDCol, iNewIndex);
				var iSpan = ReorderHelper.getHeaderSpan(oDnDCol);

				if (iSpan > 1) {
					if (!bMoveRight) {
						iNewIndex++;
					}
					for (var i = 1; i < iSpan; i++) {
						var oDependentCol = oTable.getColumns()[bMoveRight ? iOldIndex : iOldIndex + i];
						oTable.removeColumn(oDependentCol);
						oTable.insertColumn(oDependentCol, iNewIndex);
						oTable.fireColumnMove({
							column: oDependentCol,
							newPos: iNewIndex
						});
						if (!bMoveRight) {
							iNewIndex++;
						}
					}
				}
			}

			// Re-apply focus
			if (oTable._mTimeouts.reApplyFocusTimer) {
				window.clearTimeout(oTable._mTimeouts.reApplyFocusTimer);
			}
			oTable._mTimeouts.reApplyFocusTimer = window.setTimeout(function() {
				var iOldFocusedIndex = TableUtils.getFocusedItemInfo(oTable).cell;
				TableUtils.focusItem(oTable, 0, oEvent);
				TableUtils.focusItem(oTable, iOldFocusedIndex, oEvent);
			}, 0);
		},

		/*
		 * Finds the column which belongs to the current x position and returns information about this column.
		 */
		findColumnForPosition : function(oTable, iLocationX) {
			var oHeaderDomRef, $HeaderDomRef, oRect, iWidth, oPos, bBefore, bAfter;

			for (var i = 0; i < oTable._aTableHeaders.length; i++) {
				oHeaderDomRef = oTable._aTableHeaders[i];
				$HeaderDomRef = jQuery(oHeaderDomRef);
				oRect = oHeaderDomRef.getBoundingClientRect();
				iWidth = $HeaderDomRef.outerWidth();
				oPos = {
					left : oRect.left,
					center : oRect.left + iWidth / 2,
					right :  oRect.left + iWidth,
					width : iWidth,
					index : parseInt($HeaderDomRef.attr("data-sap-ui-headcolindex"), 10),
					id : $HeaderDomRef.attr("data-sap-ui-colid")
				};

				bBefore = iLocationX >= oPos.left && iLocationX <= oPos.center;
				bAfter = iLocationX >= oPos.center && iLocationX <= oPos.right;

				if (bBefore || bAfter) {
					oPos.before = oTable._bRtlMode ? bAfter : bBefore;
					oPos.after =  oTable._bRtlMode ? bBefore : bAfter;
					return oPos;
				}
			}

			return null;
		},

		/*
		 * Starts or continues stepwise horizontal scrolling until oTable._bReorderScroll is false.
		 */
		doScroll : function(oTable, bForward) {
			if (oTable._mTimeouts.horizontalReorderScrollTimer) {
				window.clearTimeout(oTable._mTimeouts.horizontalReorderScrollTimer);
				oTable._mTimeouts.horizontalReorderScrollTimer = null;
			}
			if (oTable._bReorderScroll) {
				var iStep = bForward ? 30 : -30;
				if (oTable._bRtlMode) {
					iStep = (-1) * iStep;
				}
				oTable._mTimeouts.horizontalReorderScrollTimer = jQuery.sap.delayedCall(60, oTable, ReorderHelper.doScroll, [oTable, bForward]);
				var $Scr = oTable.$("sapUiTableCtrlScr");
				var ScrollLeft = oTable._bRtlMode ? "scrollLeftRTL" : "scrollLeft";
				$Scr[ScrollLeft]($Scr[ScrollLeft]() + iStep);
			}
		},

		/*
		 * Positions the reorder marker on the column (given by the position information (@see findColumnForPosition)).
		 */
		adaptReorderMarkerPosition : function(oTable, oPos, bShow) {
			if (!oPos || !oTable._$ReorderIndicator) {
				return;
			}

			var iLeft = oPos.left - oTable.getDomRef().getBoundingClientRect().left;
			if (oTable._bRtlMode && oPos.before || !oTable._bRtlMode && oPos.after) {
				iLeft = iLeft + oPos.width;
			}

			jQuery(oTable._$ReorderIndicator).css({
				"left" : iLeft + "px"
			}).toggleClass("sapUiTableColReorderIndicatorActive", bShow);
		},

		/*
		 * Computes the header span of the given column.
		 */
		getHeaderSpan : function(oColumn) {
			var vHeaderSpan = oColumn.getHeaderSpan(),
				iSpan = 1;

			if (vHeaderSpan) {
				iSpan = jQuery.isArray(vHeaderSpan) ? vHeaderSpan[0] : vHeaderSpan;
			}

			return iSpan;
		},

		/*
		 * Checks whether the column with the given index can be reordered.
		 */
		isColumnReorderable: function(oTable, iIndex) {
			if (iIndex < oTable.getFixedColumnCount() || iIndex < oTable._iFirstReorderableIndex) {
				return false;
			}
			return true;
		}

	};



	/*
	 * Event handling of touch and mouse events.
	 * "this" in the function context is the table instance.
	 */
	var ExtensionDelegate = {

		onmousedown : function(oEvent) {
			// check whether item navigation should be reapplied from scratch
			this._getKeyboardExtension().initItemNavigation();

			if (oEvent.button === 0) { // left mouse button
				var $Target = jQuery(oEvent.target);

				if (oEvent.target === this.getDomRef("sb")) { // mousedown on interactive resize bar
					InteractiveResizeHelper.initInteractiveResizing(this, oEvent);
				} else if (oEvent.target === this.getDomRef("rsz")) { // mousedown on column resize bar
					ColumnResizeHelper.initColumnResizing(this, oEvent);
				} else if ($Target.hasClass("sapUiTableColResizer")) { // mousedown on mobile column resize button
					var iColIndex = $Target.closest(".sapUiTableCol").attr("data-sap-ui-colindex");
					this._iLastHoveredColumnIndex = parseInt(iColIndex, 10);
					ColumnResizeHelper.initColumnResizing(this, oEvent);
				} else {
					var $Col = $Target.closest(".sapUiTableCol", this.getDomRef());
					if ($Col.length === 1) { // mousedown on a column header

						var iIndex = parseInt($Col.attr("data-sap-ui-colindex"), 10),
							oColumn = this.getColumns()[iIndex];

						// Prevent potentially open column menu from closing and reopening again.
						// see Column#_openMenu
						var oMenu = oColumn.getAggregation("menu");
						oColumn._bSkipOpen = oMenu && oMenu.bOpen;

						this._bShowMenu = true;
						this._mTimeouts.delayedMenuTimer = jQuery.sap.delayedCall(200, this, function() { this._bShowMenu = false; });

						if (this.getEnableColumnReordering()
							&& !(this._isTouchMode(oEvent) && $Target.hasClass("sapUiTableColDropDown")) /*Target is not the mobile column menu button*/) {
							// Start column reordering
							this._getPointerExtension().doReorderColumn(iIndex, oEvent);
						}
					}
				}

				// In case of FireFox and CTRL+CLICK it selects the target TD
				//   => prevent the default behavior only in this case (to still allow text selection)
				// Also prevent default when clicking on ScrollBars to prevent ItemNavigation to re-apply
				// focus to old position (table cell).
				if ((Device.browser.firefox && !!(oEvent.metaKey || oEvent.ctrlKey))
						|| $Target.closest(".sapUiTableHSb", this.getDomRef()).length === 1
						|| $Target.closest(".sapUiTableVSb", this.getDomRef()).length === 1) {
					oEvent.preventDefault();
				}
			}
		},

		onmouseup : function(oEvent) {
			// clean up the timer
			jQuery.sap.clearDelayedCall(this._mTimeouts.delayedColumnReorderTimer);
		},

		ondblclick : function(oEvent) {
			if (Device.system.desktop && oEvent.target === this.getDomRef("rsz")) {
				oEvent.preventDefault();
				ColumnResizeHelper.doAutoResizeColumn(this, this._iLastHoveredColumnIndex);
			}
		},

		onclick : function(oEvent) {
			// clean up the timer
			jQuery.sap.clearDelayedCall(this._mTimeouts.delayedColumnReorderTimer);

			if (oEvent.isMarked()) {
				// the event was already handled by some other handler, do nothing.
				return;
			}

			var $Target = jQuery(oEvent.target);

			if ($Target.hasClass("sapUiAnalyticalTableSum")) {
				// Analytical Table: Sum Row cannot be selected
				oEvent.preventDefault();
				return;
			} else if ($Target.hasClass("sapUiTableGroupMenuButton")) {
				// Analytical Table: Mobile Group Menu Button in Grouping rows
				this._onContextMenu(oEvent);
				oEvent.preventDefault();
				return;
			} else if ($Target.hasClass("sapUiTableGroupIcon") || $Target.hasClass("sapUiTableTreeIcon")) {
				// Grouping Row: Toggle grouping
				if (TableUtils.toggleGroupHeader(this, oEvent.target)) {
					return;
				}
			}

			// forward the event
			if (!this._findAndfireCellEvent(this.fireCellClick, oEvent)) {
				this._onSelect(oEvent);
			} else {
				oEvent.preventDefault();
			}
		}

	};



	/**
	 * Extension for sap.ui.table.Table which handles mouse and touch related things.
	 *
	 * @class Extension for sap.ui.table.Table which handles mouse and touch related things.
	 *
	 * @extends sap.ui.table.TableExtension
	 * @author SAP SE
	 * @version ${version}
	 * @constructor
	 * @private
	 * @alias sap.ui.table.TablePointerExtension
	 */
	var TablePointerExtension = TableExtension.extend("sap.ui.table.TablePointerExtension", /* @lends sap.ui.table.TablePointerExtension */ {

		/*
		 * @see TableExtension._init
		 */
		_init : function(oTable, sTableType, mSettings) {
			this._type = sTableType;
			this._delegate = ExtensionDelegate;

			// Register the delegate
			oTable.addEventDelegate(this._delegate, oTable);

			oTable._iLastHoveredColumnIndex = 0;
			oTable._bIsColumnResizerMoving = false;
			oTable._iFirstReorderableIndex = sTableType == TableExtension.TABLETYPES.TREE ? 1 : 0;

			return "PointerExtension";
		},

		/*
		 * @see TableExtension._attachEvents
		 */
		_attachEvents : function() {
			var oTable = this.getTable();
			if (oTable) {
				// Initialize the basic event handling for column resizing.
				ColumnResizeHelper.initColumnTracking(oTable);
			}
		},

		/*
		 * @see TableExtension._detachEvents
		 */
		_detachEvents : function() {
			var oTable = this.getTable();
			if (oTable) {
				// Cleans up the basic event handling for column resizing.
				oTable.$().find(".sapUiTableCtrlScr, .sapUiTableCtrlScrFixed, .sapUiTableColHdrScr, .sapUiTableColHdrFixed").unbind();
			}
		},

		/*
		 * Enables debugging for the extension
		 */
		_debug : function() {
			this._ExtensionHelper = ExtensionHelper;
			this._ColumnResizeHelper = ColumnResizeHelper;
			this._InteractiveResizeHelper = InteractiveResizeHelper;
			this._ReorderHelper = ReorderHelper;
			this._ExtensionDelegate = ExtensionDelegate;
		},

		/*
		 * Resizes the given column to its optimal width if the auto resize feature is available for this column.
		 */
		doAutoResizeColumn : function(iColIndex) {
			var oTable = this.getTable();
			if (oTable) {
				ColumnResizeHelper.doAutoResizeColumn(oTable, iColIndex);
			}
		},

		/*
		 * Initialize the basic event handling for column reordering and starts the reordering.
		 */
		doReorderColumn : function(iColIndex, oEvent) {
			var oTable = this.getTable();
			if (oTable && oTable.getEnableColumnReordering() && ReorderHelper.isColumnReorderable(oTable, iColIndex)) {
				// Starting column drag & drop. We wait 200ms to make sure it is no click on the column to open the menu.
				oTable._mTimeouts.delayedColumnReorderTimer = jQuery.sap.delayedCall(200, oTable, function() {
					ReorderHelper.initReordering(oTable, iColIndex, oEvent);
				});
			}
		},

		/*
		 * @see sap.ui.base.Object#destroy
		 */
		destroy : function() {
			// Deregister the delegates
			var oTable = this.getTable();
			if (oTable) {
				oTable.removeEventDelegate(this._delegate);
			}
			this._delegate = null;

			TableExtension.prototype.destroy.apply(this, arguments);
		}

	});

	return TablePointerExtension;

}, /* bExport= */ true);