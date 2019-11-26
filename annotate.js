/* 

   AnnoWise 1.0
    
   Simple PDF JS Annotation functionality
   Author: Toby Wisener
   
   Offers basic annotation tools (square, circle, freehand & text highlight) for PDF.js
   
   Text Highlighting functionality is aided by Rangy.js & drawing functionality is aided by Raphael.js
   This tool should be used in conjunction with Mozilla's PDF viewer component.
   
*/

var AnnoWise = {

    // Local alias variable for parent object (AnnoWise)
    self: {},

    // Types of annotations
    HIGHLIGHT: 0,
    SQUARE: 1,
    CIRCLE: 2,
    PENCIL: 3,

    // Current record of all annotations
    annotations: [],

    // JQuery selector for child annotation layer
    annotationLayer: 'svg.annoWise',

    // Have the annotation layers etc been rendered yet?
    RENDERED: false,

    // Keep track of the pages loaded for highlights
    pages_loaded: [],
    pages_rendered: [],

    // Rangy helper modules
    classApplier: {},
    highlighter: {},

    // AnnoWise dependencies
    $paper: {}, // JQuery records for all canvases
    paper: [], // DOM records for all Raphael objects
    painter: {}, // Global Painter/Brush object

    // The current annotation/highlight being drawn
    currentAnnotation: {},
    currentHighlight: {},

    // Initialize the application, before any annotation layers are rendered
    initialize: function() {
        self = AnnoWise; // Set the helper variable

        // Bind synchronously loaded annotations
        if(typeof PREDEFINED_ANNOTATIONS !== "undefined") {
            self.annotations = PREDEFINED_ANNOTATIONS;
        }

        // Add event listeners
        $("#btnSaveAnno").bind('click', self.saveAnnotation);
        $("#btnCancelAnno").bind('click', self.cancelAnnotation);
        $('.viewer').on('mouseenter', '[data-annotation-index]', self.showTooltip)
                    .on('mouseleave', '[data-annotation-index]', self.hideTooltip);

        $("#createCommunication").bind('click', self.createCommunication);
        $("#createTask").bind('click', self.createTask);
        $("#saveAnnotations").bind('click', self.submitForm);
    },

    // Initially render the annotation layers and annotations
    render: function(event) {

        /* if(event.detail.pageNumber != PDFViewerApplication.page) { */
        // Check that ALL pages have been loaded
        //if(self.pages_rendered.length !== PDFViewerApplication.pagesCount) return;
        /* if (e.detail.pageNumber === PDFViewerApplication.page) { */
            
        // Add the annotation layers for each, if they haven't already been rendered
        if(!$(self.annotationLayer).length) {
            $( "div.page" ).each(function( index ) {
                $(this).append($(document.createElementNS('http://www.w3.org/2000/svg', 'svg')).attr("class", "annoWise a"+index).attr("data-paper-id", index));
            });

            // Refresh the list of canvases
            self.$paper = $(".annoWise");
            self.$paper.bind('mousedown touchstart', function(e) {
                if(typeof self.painter.brush.call === "undefined") return;

                self.cancelAnnotation(); // Cancel any current draft annotations
                self.painter.brush.call(this, e);
            });
            
            self.$paper.bind('mouseup touchend touchcancel', function(e) {
                var coords = self.mouseCoords(e),
                activeTool = self.activeTool();

                // Show dialog box if a shape has actually been drawn
                if(activeTool !== "pointer" && self.shapeDrawn()) {           
                    self.showAnnoMenu();
                }
                $(this).unbind('mousemove');
                $(this).unbind('touchmove');
            });

            self.paper = [];
            for(var i = 0; i < self.$paper.length; i++) {
                self.paper[i] = Raphael(self.$paper[i], $(self.$paper[i]).outerWidth(true), $(self.$paper[i]).outerHeight(true));
                self.paper[i].setSize('100%', '100%');
            }

            // Only render shapes every time the canvases are redrawn
            self.renderShapes();

            // Mark all annotations as 'unrendered'
            for(var i = 0; i < self.annotations.length; i++) {
                self.annotations[i].rendered = false;
            }
            self.pages_loaded = []; // Clear the pages loaded
            self.pages_rendered = []; // Clear the pages rendered
        }

        if(typeof event.detail !== "undefined") {
            // This page hasn't been loaded yet
            if($.inArray( event.detail.pageNumber, self.pages_loaded ) === -1) {
                self.pages_loaded.push(event.detail.pageNumber);
            }

            // Only render highlights if the page hasn't been rendered before
            if($.inArray( event.detail.pageNumber, self.pages_rendered ) === -1) {
                self.renderHighlights(event.detail.pageNumber);
            }
        }
                
        
        // Only setup the drawing tools once
        if(!self.RENDERED) {
            self.setupDrawingTools();
            self.RENDERED = true;
        }

        // Re-select any currently selected tool
        self.selectTool(self.activeTool());
    },

    // A function to render any pre-created text highlights
    renderHighlights: function(page) {
        if (self.annotations.length === 0) return;

        for (var i = 0; i < self.annotations.length; i++) {

            var annotation = self.annotations[i],
                pageContainer = $("#pageContainer" + annotation.page)[0],
                textLayer = $("#pageContainer" + annotation.page + " .textLayer")[0],
                annotationLayer = $("#pageContainer" + annotation.page + " " + self.annotationLayer)[0];
            // Page hasn't been loaded yet
            if(typeof textLayer === "undefined" || $.inArray( annotation.page, self.pages_loaded ) === -1) {
                continue;
            }

            // Annotation has already been rendered or isn't a highlight
            if(annotation.type !== self.HIGHLIGHT || annotation.rendered === true) {
                continue;
            }

            if(rangy.canDeserializeSelection(annotation.path, textLayer)) {
                rangy.deserializeSelection(annotation.path, textLayer);
                self.classApplier = rangy.createClassApplier('highlight', {
                    elementAttributes: {
                        "data-annotation-index": i
                    }
                });
                self.classApplier.applyToSelection();
                self.highlighter = rangy.createHighlighter();
                self.highlighter.addClassApplier(self.classApplier);
                self.highlighter.unhighlightSelection();

                // If we have finished all the highlights for this page
                annotation.rendered = true;
            }

        }

        self.pages_rendered.push(page); // Mark the page as 'rendered'
    },

    // A function to render any pre-drawn shapes to the annotation layer
    renderShapes: function() {
        if (self.annotations.length === 0) return;
        for (var i = 0; i < self.annotations.length; i++) {
            var annotation = self.annotations[i],
                pageContainer = $("#pageContainer" + annotation.page)[0],
                textLayer = $("#pageContainer" + annotation.page + " .textLayer")[0],
                annotationLayer = $("#pageContainer" + annotation.page + " .a" + (annotation.page-1)),
                currentScale = typeof PDFViewerApplication !== "undefined" ? PDFViewerApplication.pdfViewer.currentScale : 1;

            switch (annotation.type) {
                case self.HIGHLIGHT:
                    continue;

                case self.CIRCLE:
                    $(document.createElementNS("http://www.w3.org/2000/svg", "circle")).attr({
                        "data-annotation-index": i,
                        r: annotation.width * currentScale,
                        cx: annotation.x * currentScale,
                        cy: annotation.y * currentScale,
                        stroke: "red",
                        "stroke-width": "3",
                        fill: "none",
                        class: "annotation"
                    }).appendTo(annotationLayer);

                    break;

                case self.SQUARE:
                    $(document.createElementNS("http://www.w3.org/2000/svg", "rect")).attr({
                        "data-annotation-index": i,
                        x: annotation.x,
                        y: annotation.y,
                        width: annotation.width,
                        height: annotation.height,
                        transform: "scale("+currentScale+")",
                        stroke: "red",
                        "stroke-width": "3",
                        fill: "none",
                        class: "annotation"
                    }).appendTo(annotationLayer);
                    break;

                case self.PENCIL:
                    $(document.createElementNS("http://www.w3.org/2000/svg", "path")).attr({
                        "data-annotation-index": i,
                        transform: "scale("+currentScale+")",
                        stroke: "red",
                        "stroke-width": "3",
                        fill: "none",
                        d: annotation.path,
                        class: "annotation"
                    }).appendTo(annotationLayer);
                    break;

            }

            if(typeof PDFViewerApplication !== "undefined") {
                // Rotate/Scale annotations (Only inside PDFViewer)
                var relativeRotation =  PDFViewerApplication.pageRotation, absRotation = Math.abs(relativeRotation);
                var scaleX = 1, scaleY = 1;
                if (absRotation === 90 || absRotation === 270) {
                    // Scale x and y because of the rotation.
                    var viewport = PDFViewerApplication.pdfViewer.getPageView(annotation.page).pdfPage.getViewport(PDFViewerApplication.pdfViewer.currentScale);
                    scaleX = $(self.annotationLayer).height() / $(self.annotationLayer).width();
                    scaleY = $(self.annotationLayer).width() / $(self.annotationLayer).height();
                }
                self.rotateAnnotations(relativeRotation, scaleX, scaleY);
            }
            
        }
    },

    // A function to clear the annotation layer
    clearShapes: function() {
        $(self.annotationLayer).empty();
    },

    // Remove the current shape from the DOM
    clearCurrentShape: function() {
        if(self.currentAnnotation === {}) return;

        $(self.currentAnnotation.node).remove();
        self.currentAnnotation = {};
    },

    // Determine whether an annotation has actually been drawn or not
    shapeDrawn: function() {
        var $currentAnnotation = $(self.currentAnnotation.element[0]);
        if(!$currentAnnotation.length) return false;

        var size = self.currentAnnotation.element[0].getBoundingClientRect();
        return (size.width > 0 && size.height > 0);
    },

    // Actions performed when the save button is clicked
    saveAnnotation: function(e) {
        if(typeof self.currentAnnotation.element !== "undefined") {
            var $currentAnnotation = $(self.currentAnnotation.element[0]);

            // Persist annotations
            self.annotations.push({
                id: self.annotations.length,
                doc_id: null,
                page: self.currentPageNumber(),
                type: self.currentAnnotation.type,
                x: $currentAnnotation.attr('x') || $currentAnnotation.attr('cx') || 0,
                y: $currentAnnotation.attr('y') || $currentAnnotation.attr('cy') || 0,
                width: $currentAnnotation.attr('width') || $currentAnnotation.attr('r') || undefined,
                height: $currentAnnotation.attr('height') || 0,
                path: $currentAnnotation.attr('d'), // from .textLayer
                comment: $('#annoComment').val(),
                elements: []
            });
        } else if(typeof self.currentHighlight.path !== "undefined") {
            // Persist highlights
            var newIndex = self.annotations.length;
            self.annotations.push({
                annotation_id: newIndex,
                doc_id: null,
                page: self.currentHighlight.page,
                type: self.HIGHLIGHT,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                path: self.currentHighlight.path, // from .textLayer
                comment: $('#annoComment').val(),
                elements: []
            });

            var textLayer = $("#pageContainer" + self.currentHighlight.page + " .textLayer")[0];
            rangy.deserializeSelection(self.currentHighlight.path, textLayer);
            self.classApplier = rangy.createClassApplier('highlight', {
                elementAttributes: {
                    "data-annotation-index": newIndex
                }
            });
            self.highlighter = rangy.createHighlighter();
            self.highlighter.addClassApplier(self.classApplier);
            self.classApplier.applyToSelection();
            self.highlighter.unhighlightSelection();

        }
        $("#annoComment").val("");
        $("#annoMenu").hide();

        // Force the user to re-select the tool they now want
        self.selectTool("pointer");

        // Render the shape truly onto our canvas:
        self.clearCurrentShape();

        // Trigger the render loop to show all shapes
        self.renderShapes();
    },

    // Cancel the Annotation currently being drawn
    cancelAnnotation: function(e) {
        if(typeof self.currentAnnotation.element !== "undefined") {
            var $currentAnnotation = $(self.currentAnnotation.element[0]);
            $currentAnnotation.remove();
            $("#annoComment").val("");
            $("#annoMenu").hide();

            // Render the shape truly onto our canvas:
            self.clearCurrentShape();

            // Trigger the render loop to show all shapes
            self.renderShapes();
        } else if(typeof self.currentHighlight.path !== "undefined") {

            $("#annoComment").val("");
            $("#annoMenu").hide();

            self.highlighter.unhighlightSelection();
            self.currentHighlight = {};
        }
        
    },
    
    // Returns the page number of the current annotation
    currentPageNumber: function() {
        var $currentAnnotation = $(self.currentAnnotation.element[0]);
        if(!$currentAnnotation.length) {
            return 0;
        }
        
        return $currentAnnotation.parents("div.page").attr("data-page-number");
    },

    // A function to handle the rotation and scaling of annotations
    rotateAnnotations: function(rotation, scaleX, scaleY) {
        var cssTransform = 'rotate(' + rotation + 'deg)' +
        'scale(' + scaleX + ',' + scaleY + ')';
        $(self.annotationLayer).attr("transform", "rotate("+rotation+")");
        var transX, transY;
        var r = $(self.annotationLayer+" circle").attr("r"),
            x = $(self.annotationLayer+" circle").attr("cx"),
            y = $(self.annotationLayer+" circle").attr("cy"),
            width = $(self.annotationLayer).width(),
            height = $(self.annotationLayer).height();
        
        switch (Math.abs(rotation)) {
          case 0:
                transX = transY = 0;
            break;
          case 90:
                transX = ((width - x) - y);
                transY = x - y;
            break;
          case 180:
                transX = (width - x) - x;
                transY = (height - y) - y;
            break;
          case 270:
                transX = y - x;
                transY = (height - y) - x
            break;
        }

        $(self.annotationLayer+" circle").attr({
            "transform": "translate(" + transX + ", " + transY + ")"
        });
    },

    // A function called when text is selected
    textHighlighted: function(e) {
        if(self.activeTool() !== "highlighter") return;
        var coords = self.mouseCoords(e);

        // Traverse the <span>s so we can put tooltips on them and shit
        var selectedNodes = self.getSelectedNodes();
        if (selectedNodes.length === 0) return; // Ensure something was selected

        $(selectedNodes).addClass("annotation");

        var pageNumber = $(selectedNodes[0]).parents("div.page").attr("data-page-number");
        if (typeof pageNumber === "undefined") {
            alert("Highlight annotations cannot span multiple pages.");
            //self.highlighter.unhighlightSelection();
            return;
        }

        var rootNode = $("#pageContainer" + pageNumber + " .textLayer")[0];
        var sel = rangy.getSelection(),
        serialized = rangy.serializeSelection(sel, true, rootNode);

        self.currentHighlight = {
            path: serialized,
            page: pageNumber
        };

        self.showAnnoMenu();
    },

    // A function to get the currently partially selected HTML nodes
    getSelectedNodes: function() {
        var selectedNodes = [];
        var sel = rangy.getSelection();
        for (var i = 0; i < sel.rangeCount; ++i) {
            selectedNodes = selectedNodes.concat(sel.getRangeAt(i).getNodes());
        }

        return selectedNodes;
    },

    // A centralised function to get accurate mouse coordinates
    mouseCoords: function(e) {
        var rect = e.target.getBoundingClientRect();

        if(e.type === "touchstart" || e.type === "touchmove") {  
            return { 
                x: e.originalEvent.touches[0].pageX - rect.left, 
                y: e.originalEvent.touches[0].pageY - rect.top 
            };
        } else if(e.type === "touchend" || e.type === "touchcancel" ) {
            return { 
                x: e.originalEvent.changedTouches[0].pageX - rect.left, 
                y: e.originalEvent.changedTouches[0].pageY - rect.top 
            };
        } else {
            return {
                x: e.offsetX === undefined ? e.originalEvent.layerX : e.offsetX,
                y: e.offsetY === undefined ? e.originalEvent.layerY : e.offsetY
            };
        }

        
    },

    // Shows the tooltip for a given annotation
    showTooltip: function(e) {
        var thisAnnotation = self.annotations[$(this).attr("data-annotation-index")];

        var d = new Date(thisAnnotation.created_at);

        $("#annoTooltip").css({ 
            top: e.pageY + $("#viewerContainer").scrollTop(), 
            left: e.pageX + $("#viewerContainer").scrollLeft() 
        }).html('"<i>' + thisAnnotation.comment + '</i>"<hr/>'
        + (typeof thisAnnotation.user !== "undefined" && thisAnnotation.user !== null ? 
            thisAnnotation.user.forename + ' ' + thisAnnotation.user.surname  + '<br/><small>' + d.toUTCString() + '</small>'
            : 'You')).show();
    },

    // Hides the tooltip for any annotation
    hideTooltip: function(e) {
        var thisAnnotation = self.annotations[$(this).attr("data-annotation-index")];

        $("#annoTooltip").text("").hide();
    },

    // Shows the menu for composing a comment
    showAnnoMenu: function() {
        $annoMenu = $("#annoMenu");
        $annoMenu.show();
        $annoMenu.children("textarea").focus();
    },

    // Returns the ID of the active tool
    activeTool: function() {
        return $('.annotation-tool.active').attr("id");
    },

    // Selects a given tool by it's ID
    selectTool: function(toolId) {
        $('.annotation-tool').removeClass('active');
        $("#"+toolId).addClass('active');
        self.cancelAnnotation(); // Cancel any current draft annotations

        switch(toolId) {
            case "pointer":
                self.painter.brush = {};
                $(self.annotationLayer).css('pointer-events', 'none');

                // Prevent touch scrolling
                $("#viewerContainer").unbind('touchmove');
            break;

            case "highlighter":
                $(self.annotationLayer).css('pointer-events', 'none');

                // Prevent touch scrolling
                $("#viewerContainer").bind('touchmove', function(e){e.preventDefault()});
            break;

            case "pencil":
                $(self.annotationLayer).css('pointer-events', 'all');
                self.painter.brush = function(e) {
                    var index = $(e.target).attr("data-paper-id");
                    if(typeof index === "undefined") return;

                    var shape = Pencil(self.mouseCoords(e).x, self.mouseCoords(e).y, self.paper[index]);
                    self.currentAnnotation = shape;
                    $(self.$paper[index]).bind('mousemove touchmove', function(e) {
                        self.currentAnnotation.updateEnd(self.mouseCoords(e).x, self.mouseCoords(e).y);
                    });
                };

                // Prevent touch scrolling
                $("#viewerContainer").bind('touchmove', function(e){e.preventDefault()});
            break;

            case "square":
                $(self.annotationLayer).css('pointer-events', 'all');
                self.painter.brush = function(e) {
                    var index = $(e.target).attr("data-paper-id");
                    if(typeof index === "undefined") return;

                    var shape = Rect(self.mouseCoords(e).x, self.mouseCoords(e).y, 5, 5, self.paper[index]);
                    self.currentAnnotation = shape;
                    $(self.$paper[index]).bind('mousemove touchmove', function(e) {
                        self.currentAnnotation.updateEnd(self.mouseCoords(e).x, self.mouseCoords(e).y);
                    });
                };

                // Prevent touch scrolling
                $("#viewerContainer").bind('touchmove', function(e){e.preventDefault()});
            break;

            case "circle":
                $(self.annotationLayer).css('pointer-events', 'all');
                self.painter.brush = function(e) {
                    var index = $(e.target).attr("data-paper-id");
                    if(typeof index === "undefined") return;

                    var shape = Circle(self.mouseCoords(e).x, self.mouseCoords(e).y, 5, self.paper[index]);
                    self.currentAnnotation = shape;
                    $(self.$paper[index]).bind('mousemove touchmove', function(e) {
                        self.currentAnnotation.updateEnd(self.mouseCoords(e).x, self.mouseCoords(e).y);
                    });
                };

                // Prevent touch scrolling
                $("#viewerContainer").bind('touchmove', function(e){e.preventDefault()});
            break;
        }
    },

    // Detect whether the user has zoomed or not
    isZoomed: function() {

        return window.matchMedia('(max--moz-device-pixel-ratio:0.99), (min--moz-device-pixel-ratio:1.01)').matches;

        //var screenCssPixelRatio = (window.outerWidth - 8) / window.innerWidth;
        //return (screenCssPixelRatio < .98 || screenCssPixelRatio > 1.02);
    },

    // Setup the drawing tools once
    setupDrawingTools: function() {
        self.painter.brush = function() {};

        $('.annotation-tool').bind('click', function(e) {
            if ($(this).hasClass('active')) return;
            
            // Don't allow annotating while browser is zoomed
            /*if(!/Mobi/.test(navigator.userAgent) && self.isZoomed()) { 
                var screenCssPixelRatio = (window.outerWidth - 16) / window.innerWidth;
                var browserZoomLevel = Math.round(window.devicePixelRatio * 100);
                sh_warning("Please reset the zoom setting in your browser before continuing. ("+screenCssPixelRatio+") " + browserZoomLevel);
                return;
            }*/
            
            // Force annotations to be drawn at 1.0 zoom
            if(typeof PDFViewerApplication !== "undefined") {
                PDFViewerApplication.pdfViewer.currentScale = 1;
            }
            document.body.style.zoom = 1.0;    

            // Select the given tool
            self.selectTool($(this).attr('id'));
        });
   },

    // Method to create communication with our given annotations
    createCommunication: function(e) {
        var $form = $("#communicationForm");

        self.serializeAnnotations($form);

        $form.submit();
    },

    createTask: function(e) {
        $form = $("#taskForm");

        self.serializeAnnotations($form);

        $form.submit();
    },

    // Used for ad-hoc annotations
    submitForm: function(e) {
        $form = $("#saveForm");

        self.serializeAnnotations($form);

        $form.submit();
    },

    serializeAnnotations: function($form) {
        $form.empty();

        $form.append($("<input/>").attr({ type: "hidden", name: "file_id", value: $form.attr("data-file-id") }),
            $("<input/>").attr({ type: "hidden", name: "file_name", value: $form.attr("data-file-name") }));
        for (var i = 0; i < self.annotations.length; i++) {
            var annotation = self.annotations[i];

            $form.append(
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][page]", value: annotation.page }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][type]", value: annotation.type }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][x]", value: annotation.x }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][y]", value: annotation.y }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][width]", value: annotation.width }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][height]", value: annotation.height }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][path]", value: annotation.path }),
                $("<input/>").attr({ type: "hidden", name: "annotations["+i+"][comment]", value: annotation.comment })
            );
            
            /*

            var annotations = { comment: "whatever the comment is" }

            ->

            <input type="hidden" name="comment" value="whatever the comment is"/>
            
            */
        }
    }

};

// Drawing functionality
function Circle(startX, startY, width, raphael) {
    var start = {
        x: startX,
        y: startY,
        w: width
    };
    var end = {
        w: width
    };
    var getWidth = function() {
        return end.w;
    };
    var redraw = function() {
        node.attr({
            r: getWidth()
        });
    }
    var node = raphael.circle(start.x, start.y, getWidth());
    node.attr({
        stroke: "red",
        "stroke-width": 3
    });
    return {
        type: AnnoWise.CIRCLE,
        updateStart: function(x, y) {
            start.x = x;
            start.y = y;
            redraw();
            return this;
        },
        updateEnd: function(x, y) {
            var v = {
                x: Math.abs(x - start.x),
                y: Math.abs(y - start.y)
            };
            //Radius
            end.w = Math.sqrt((Math.pow(v.x, 2) + Math.pow(v.y, 2)));
            redraw();
            return this;
        },
        clear: function() {
            node.remove();
        },
        element: node
    };
};

function Rect(startX, startY, width, height, raphael) {
    var start = {
        x: startX,
        y: startY,
        w: width,
        h: height
    };
    var end = {
        x: startX,
        y: startY,
        w: width,
        h: height
    };
    var end = function() {
        return end;
    };
    var redraw = function() {
        node.attr({
            x: end().x,
            //y: end().y,
            width: end().w,
            height: end().h
        });
    }

    var node = raphael.rect(start.x, start.y, end().w, end().h);
    node.attr({
        stroke: "red",
        "stroke-width": 3
    });

    return {
        type: AnnoWise.SQUARE,
        updateStart: function(x, y) {
            start.x = x;
            start.y = y;
            redraw();
            return this;
        },
        updateEnd: function(x, y) {
            var v = {
                x: start.x > x ? Math.abs(start.x - x) : Math.abs(x - start.x),
                y: start.y > y ? Math.abs(start.y, y) : Math.abs(y - start.y)
            };
            //Width
            var widthe = Math.sqrt((Math.pow(v.x, 2) + Math.pow(v.y, 2)));

            var width = Math.sqrt(Math.pow(v.x, 2));
            var height = Math.sqrt(Math.pow(v.y, 2));

            end.x = start.x > x ? x : start.x;
            end.y = start.y > y ? y : start.y;
            end.h = height;
            end.w = width;
            redraw();
            return this;
        },
        clear: function() {
            node.remove();
        },
        element: node
    };
};

function Pencil(startX, startY, raphael) {
    var pathArray = new Array();
    var start = {
        x: startX,
        y: startY
    };

    var getPathArray = function() {
        return pathArray;
    };
    var redraw = function() {
        // Update the path of the element
        node.attr({
            path: getPathArray()
        });
    }

    var node = raphael.path(pathArray);
    node.attr({
        stroke: "red",
        "stroke-width": 3
    });

    return {
        type: AnnoWise.PENCIL,
        updateStart: function(x, y) {
            pathArray[0] = ["M", x, y];
            redraw();
            return this;
        },
        updateEnd: function(x, y) {
            if (pathArray.length == 0) {
                pathArray[0] = ["M", x, y];
            } else {
                pathArray[pathArray.length] = ["L", x, y];
            }

            redraw();
            return this;
        },
        clear: function() {
            node.remove();
        },
        element: node
    };
};
