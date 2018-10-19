//Author-Hans Kellner
//Description-Generate a voronoi sketch in Autodesk Fusion 360.

/*!
Copyright (C) 2015 Hans Kellner: https://github.com/hanskellner/Fusion360Voronoi
MIT License: See https://github.com/hanskellner/Fusion360Voronoi/LICENSE.md
*/

/*
This is a script for Autodesk Fusion 360 that generates Voronoi sketches.

Credits:

This code makes use of the Raymond Hill's well done Javascript-Voronoi code:
https://github.com/gorhill/Javascript-Voronoi
*/

/*globals adsk*/

var commandId = 'VoronoiSketchGenerator';
var workspaceToUse = 'FusionSolidEnvironment';
var panelToUse = 'SolidCreatePanel';

var errorDescription = function(e) {
    return (e.description ? e.description : e);
};

var commandDefinitionById = function(id) {
    var app = adsk.core.Application.get();
    var ui = app.userInterface;
    if (!id) {
        ui.messageBox('commandDefinition id is not specified');
        return null;
    }
    var commandDefinitions_ = ui.commandDefinitions;
    var commandDefinition_ = commandDefinitions_.itemById(id);
    return commandDefinition_;
};

var getToolbarControls = function() {
    var toolbarControls_ = null;

    var app = adsk.core.Application.get();
    var ui = app.userInterface;
    var workspaces_ = ui.workspaces;
    var modelingWorkspace_ = workspaces_.itemById(workspaceToUse);
    if (modelingWorkspace_) {
        var toolbarPanels_ = modelingWorkspace_.toolbarPanels;
        var toolbarPanel_ = toolbarPanels_.itemById(panelToUse); 
        if (toolbarPanel_) {
            toolbarControls_ = toolbarPanel_.controls;
        }
    }

    return toolbarControls_;
};

var commandControlById = function(id) {
    var app = adsk.core.Application.get();
    var ui = app.userInterface;
    if (!id) {
        ui.messageBox('commandControl id is not specified');
        return null;
    }
    
    var toolbarControls_ = getToolbarControls();
    if (!toolbarControls_) {
        ui.messageBox('Unable to find Toolbar Controls for "' + workspaceToUse + '.' + panelToUse + '"');
        return null;
    }

    var toolbarControl_ = toolbarControls_.itemById(id);
    return toolbarControl_;
};

var destroyObject = function(uiObj, tobeDeleteObj) {
    if (uiObj && tobeDeleteObj) {
        if (tobeDeleteObj.isValid) {
            tobeDeleteObj.deleteMe();
        } else {
            uiObj.messageBox('tobeDeleteObj is not a valid object');
        }
    }
};

function run(context) {
    "use strict";

    if (adsk.debug === true) {
        /*jslint debug: true*/
        debugger;
        /*jslint debug: false*/
    }

	var appTitle = 'Voronoi Sketch Generator';

	var app = adsk.core.Application.get(), ui;
    if (app) {
        ui = app.userInterface;
    }
const getArea = (cell) => cell.halfedges.reduceRight((area, halfedge) => {
    const p1 = halfedge.getStartpoint()
    const p2 = halfedge.getEndpoint()
    area += p1.x * p2.y
    area -= p1.y * p2.x
    return area
}, 0)/2

const getCentroid = (cell) => {
    const area = getArea(cell) * 6
    const {x, y} = cell.halfedges.reduceRight(({x, y}, halfedge) => {
        const p1 = halfedge.getStartpoint()
        const p2 = halfedge.getEndpoint()
        const v = p1.x * p2.y - p2.x * p1.y
        x += (p1.x + p2.x) * v
        y += (p1.y + p2.y) * v
        return {x, y}
    }, {x:0, y:0})
    return {x: x/area, y: y/area}
}

const getDistance = (a, b) => Math.sqrt(Math.pow(a.x-b.x, 2)+Math.pow(a.y-b.y, 2))

const relax = (diagram) => {
    let again = false
    const p = 1 / diagram.cells.length * 0.1
    return diagram.cells.reduce((sites, cell) => {
        const rn = Math.random() // :(
        if(rn < p) { return sites }
        const site = getCentroid(cell)
        let dist = getDistance(site, cell.site)
        again = again || dist > 1
        // don't relax too fast
        if (dist > 2) {
            site.x = (site.x+cell.site.x)/2;
            site.y = (site.y+cell.site.y)/2;
        }
        // probability of mytosis
        if (rn > (1-p)) {
            dist /= 2;
            sites.push({
                x: site.x+(site.x-cell.site.x)/dist,
                y: site.y+(site.y-cell.site.y)/dist,
            });
        }
        sites.push(site)
        return sites
    }, [])
}

    // Create the command definition.
    var createCommandDefinition = function() {
        var commandDefinitions = ui.commandDefinitions;

        // Be fault tolerant in case the command is already added...
        var cmdDef = commandDefinitions.itemById(commandId);
        if (!cmdDef) {
            cmdDef = commandDefinitions.addButtonDefinition(commandId,
                    'Voronoi Sketch Generator',
                    'Generates a Voronoi sketch\n',
                    './resources'); // relative resource file path is specified
            cmdDef.toolClipFilename = './resources/Voronoi-tooltip.png';
        }
        return cmdDef;
    };

    // CommandCreated event handler.
    var onCommandCreated = function(args) {
        try {
            // Connect to the CommandExecuted event.
            var command = args.command;
            command.execute.add(onCommandExecuted);

            // Define the inputs.
            var inputs = command.commandInputs;

            var selectionInput = inputs.addSelectionInput('sketchSelection', 'Sketch Selection', 'Select a sketch to place the Voronoi');
            selectionInput.addSelectionFilter('Sketches');  // Select sketches only
            selectionInput.setSelectionLimits(0,1);         // None or 1 sketch

            var edgeStyleInput = inputs.addDropDownCommandInput('edgeStyle', 'Edge Style', adsk.core.DropDownStyles.TextListDropDownStyle );
            edgeStyleInput.listItems.add('Curved', false);
            edgeStyleInput.listItems.add('Straight', true);

            // ISSUE: Unit type needs to be specified but I just need a unitless value. For unitless
            // I'll have to use string input for now.
            var countInput = inputs.addStringValueInput('count','Number of Cells (2-256)','16');
            var relaxInput = inputs.addStringValueInput('relax','Number of Lloyd\'s relax iterations','10');

            var initialValW = adsk.core.ValueInput.createByReal(15.0);
            var widthInput = inputs.addValueInput('width', 'Pattern width', 'mm' , initialValW);

            var initialValH = adsk.core.ValueInput.createByReal(15.0);
            var heightInput = inputs.addValueInput('height', 'Pattern height', 'mm' , initialValH);

            var scaleInput = inputs.addStringValueInput('scale','% to scale cells (10-100)','80');
        }
        catch (e) {
            ui.messageBox('Failed to create Voronoi command : ' + (e.description ? e.description : e));
        }
    };

    // CommandExecuted event handler.
    var onCommandExecuted = function(args) {
        try {
            var design = app.activeProduct;
            if (!design) {
                ui.messageBox('No active design', appTitle);
                adsk.terminate();
                return;
            }

            // Extract input values
            var unitsMgr = app.activeProduct.unitsManager;
            var command = adsk.core.Command(args.firingEvent.sender);
            var inputs = command.commandInputs;
            let sketchSelectionInput, widthInput, heightInput, countInput, edgeStyleInput, scaleInput, relaxInput;

            // REVIEW: Problem with a problem - the inputs are empty at this point. We
            // need access to the inputs within a command during the execute.
            for (var n = 0; n < inputs.count; n++) {
                var input = inputs.item(n);
                if (input.id === 'sketchSelection') {
                    sketchSelectionInput = adsk.core.SelectionCommandInput(input);
                }
                else if (input.id === 'width') {
                    widthInput = adsk.core.ValueCommandInput(input);
                }
                else if (input.id === 'height') {
                    heightInput = adsk.core.ValueCommandInput(input);
                }
                else if (input.id === 'count') {
                    countInput = adsk.core.StringValueCommandInput(input);
                }
                else if (input.id === 'edgeStyle') {
                    edgeStyleInput = adsk.core.DropDownCommandInput(input);
                }
                else if (input.id === 'scale') {
                    scaleInput = adsk.core.StringValueCommandInput(input);
                }
                else if (input.id === 'relax') {
                    relaxInput = adsk.core.StringValueCommandInput(input);
                }
            }

            if (!sketchSelectionInput || !edgeStyleInput || !countInput || !widthInput || !heightInput || !scaleInput || !relaxInput) {
                ui.messageBox("One of the inputs does not exist.");
                return;
            }

            // holds the parameters
            var params = {
                edgeStyle: 0,   // 0 = curve, 1 = straight
                count: 16,
                width: 10,
                height: 10,
                scale: 80,
                margin: 0,
                relax: 0,
                selectedSketch: null
            };

            // Get the selected body
            if (sketchSelectionInput.selectionCount == 1) {
                params.selectedSketch = sketchSelectionInput.selection(0).entity;
                if (!params.selectedSketch) {
                    ui.messageBox("Failed to get the selected sketch.");
                    return;
                }
            }

            params.relax = parseInt(relaxInput.value, 10)

            params.edgeStyle = edgeStyleInput.selectedItem.index;
            if (params.edgeStyle < 0 || params.edgeStyle > 1) {
                ui.messageBox("Invalid edge style: must be 0 to 1");
                return;
            }

            if (countInput.value !== '') {
                params.count = parseInt(countInput.value);
            }

            if (params.count < 2 || params.count > 256) {
                ui.messageBox("Invalid cell count: must be 2 to 256");
                return;
            }

            params.width = unitsMgr.evaluateExpression(widthInput.expression, "cm");
            if (params.width <= 0.0) {
                ui.messageBox("Invalid width: must be > 0");
                return;
            }

            params.height = unitsMgr.evaluateExpression(heightInput.expression, "cm");
            if (params.height <= 0.0) {
                ui.messageBox("Invalid height: must be > 0");
                return;
            }

            if (scaleInput.value !== '') {
                params.scale = parseInt(scaleInput.value);
            }

            if (params.scale < 10 || params.scale > 100) {
                ui.messageBox("Invalid cell scale: must be 10 to 100");
                return;
            }

            // Generate the drawing
			generateVoronoi(params);
        }
        catch (e) {
            ui.messageBox('Failed to execute command : ' + (e.description ? e.description : e));
        }
    };

	function generateVoronoi(params) {

        var edgeStyle = params["edgeStyle"];
        var cellCount = params["count"];
        var width = params["width"];
        var height = params["height"];
        var scale = params["scale"] / 100.0;  // convert from %
        var margin = params["margin"];
        var theSketch = params["selectedSketch"];

		var bbox = {
			xl: margin,
			xr: width - margin,
			yt: margin,
			yb: height - margin
		};

        // prime the random number generator
        var seed = new Date().getTime();
        lastRandom = primeNumbers[(seed % primeNumbers.length)] * seed;

        // Create a set of random cell sites.  These are center points of each cell.
    	var sites = [];
    	for (var iCells = 0; iCells < cellCount; ++iCells) {
    		var site = {x: nextRandomNumber() * (width - 2*margin), y: nextRandomNumber() * (height - 2*margin)};
    		sites.push(site);
    	}

		var voronoi = new Voronoi();
		var diagram = voronoi.compute(sites, bbox);
		if (!diagram) {
            ui.messageBox('Failed to generate voronoi');
            return false;
        }

        while(params.relax--)
            diagram = voronoi.compute(relax(diagram), bbox);

        // If a sketch wasn't selected then create a sketch on the XY plane to hold the voronoi.
        if (!theSketch) {
            var design = app.activeProduct;
            var root = design.rootComponent;
            theSketch = root.sketches.add(root.xYConstructionPlane);
            theSketch.name = "Voronoi - " + theSketch.name;
        }

        theSketch.isComputeDeferred = true;

        // Create each of the voronoi cells...
    	var cells = diagram.cells;
    	for (var cIndex in cells) {

    		var cell = cells[cIndex];
    		var halfEdges = cell.halfedges;

            // Need at least 3
			if (halfEdges.length > 2) {

                // Gather the start points of the edges so we can create
                // a path/spline.
        		var pts = [];
        		for (var eIndex in halfEdges) {

        			// Get the positios...
        			var halfEdge = halfEdges[eIndex];
        			pts.push(halfEdge.getStartpoint());
        		}

				createCellPath(theSketch, pts, edgeStyle, scale);
			}
		}
        
        // Create a rectangle around the shape
        theSketch.sketchCurves.sketchLines.addTwoPointRectangle(
            adsk.core.Point3D.create(0, 0, 0),
            adsk.core.Point3D.create(width, height, 0));

        theSketch.isComputeDeferred = false;
	}

	function createCellPath(sketch, points, edgeStyle, scale, width, height) {

        var ptslen = points.length;
        if (ptslen < 1) {
            return false;
        }

        // First scale the points to shrink them closer to the
        // center point.  This creates the margins.
        var scaledPoints = scalePointsAboutCenter(scale, points);

        // Remove small segments/edges
        var xMin, xMax, yMin, yMax;
        xMin = xMax = scaledPoints[0].x;
        yMin = yMax = scaledPoints[0].y;

        for (var i0 = 0; i0 < ptslen; ++i0) {
            if (scaledPoints[i0].x < xMin) { xMin = scaledPoints[i0].x; }
            if (scaledPoints[i0].x > xMax) { xMax = scaledPoints[i0].x; }
            if (scaledPoints[i0].y < yMin) { yMin = scaledPoints[i0].y; }
            if (scaledPoints[i0].y > yMax) { yMax = scaledPoints[i0].y; }
        }

        // If width or height of path will be under 10% of sketch size then reject it.
        // We don't want tiny little pieces.
        if (Math.abs(xMax-xMin) < (width*0.1) || Math.abs(yMax-yMin) < (height*0.1)) {
            return false;
        }

        // Next, begin creating geometry for these point
        if (edgeStyle == 1 /*Lines*/) {

            // Create the lines.
            var lines = sketch.sketchCurves.sketchLines;

    		for (var i1 = 0; i1 < ptslen; ++i1) {

                var point1 = scaledPoints[i1];
                var point2 = scaledPoints[(i1 + 1) % ptslen];

                // Add a line between these two points
                lines.addByTwoPoints(adsk.core.Point3D.create(point1.x, point1.y, 0), adsk.core.Point3D.create(point2.x, point2.y, 0));
    		}
        }
        else { // if (edgeStyle == 0 /*Curves*/) {

            // Create the splines
            var points3d = adsk.core.ObjectCollection.create();

    		for (var i2 = 0; i2 < ptslen; ++i2) {

                var point1 = scaledPoints[i2];
                var point2 = scaledPoints[(i2 + 1) % ptslen];

                var xMidPt = (point2.x + point1.x) / 2;
                var yMidPt = (point2.y + point1.y) / 2;

                // TODO: Need a way to specify spline handle vectors/weights
                // Also, a way to set the handles independently.
    		    //  handle in = -vector
    			//  handle out = vector

                // Add this point to collection used for spline
                points3d.add(adsk.core.Point3D.create(xMidPt, yMidPt, 0));
    		}

            // Now create the spline to fit these points.
            var spline = sketch.sketchCurves.sketchFittedSplines.add(points3d);
            spline.isClosed = true;

            // TODO: Need some way to adjust the knots/handles of the curves so the
            // curves are tighter and better conform to each other.
            //var splineGeom = spline.geometry; // NurbsCurve3D
            //var knots = splineGeom.knots;
        }

        return true;
	}

    // Scale a set of point about a center point
    function scalePointsAboutCenter(scale, points) {

        if (!points || points.length === 0) {
            return [];
        }

        if (scale == 100) {
            return points;
        }

        var xCenter = 0, yCenter = 0;
        for (var iCtr = 0; iCtr < points.length; ++iCtr) {
            xCenter += points[iCtr].x;
            yCenter += points[iCtr].y;
        }
        xCenter /= points.length;
        yCenter /= points.length;

        var scaledPoints = [];
        for (var i = 0; i < points.length; ++i) {

            var pt = {x: points[i].x, y: points[i].y};

            // 1. Normalize point by subtracting center
            pt.x -= xCenter; //center.x;
            pt.y -= yCenter; //center.y;

            // 2. Scale point
            pt.x *= scale;
            pt.y *= scale;

            // 3. Add center back to point
            pt.x += xCenter; //center.x;
            pt.y += yCenter; //center.y;

            scaledPoints.push(pt);
        }

        return scaledPoints;
    }

    var primeNumbers = [
    	5915587277,
    	1500450271,
    	3267000013,
    	5754853343,
    	4093082899,
    	9576890767,
    	3628273133,
    	2860486313,
    	5463458053,
    	3367900313
    ];

    /*!
    This technique was taken from the following URL.  The previously
    published Terrain and Asteroid Shape Scripts should probably be
    updated to use this technique since it gets several credible
    mentions in the online gaming communities.  There are various
    other articles online about seeded repeatable random number
    sequence generating techniques though.  Repeatable is imporant
    so that the shape doesn't change on subsequent document opens.

    1. http://jacksondunstan.com/articles/393
    2. http://indiegamr.com/generate-repeatable-random-numbers-in-js/
    3. http://jsperf.com/object-lookup-vs-indexof
    etc...
    */
    var lastRandom = 0;
    function nextRandomNumber()
    {
        lastRandom = (lastRandom * 9301 + 49297) % 233280;
        var randomNumber = lastRandom / 233280;
        return randomNumber;
    }

    // Start of the script...
	try {
        // Create and run command
        var commandDef = createCommandDefinition();
        var commandCreatedEvent = commandDef.commandCreated;
        commandCreatedEvent.add(onCommandCreated);

        // add a command on Sketch panel in modeling workspace
        var toolbarControls_ = getToolbarControls();
        if (!toolbarControls_) {
            throw 'Unable to find Toolbar Controls for "' + workspaceToUse + '.' + panelToUse + '"';
        }
    
        var toolbarControl_ = toolbarControls_.itemById(commandId);
        if (!toolbarControl_) {
            toolbarControl_ = toolbarControls_.addCommand(commandDef, '');
            toolbarControl_.isVisible = true;
        }
    }
    catch (e) {
        if (ui) {
            ui.messageBox('Voronoi Script Failed : ' + (e.description ? e.description : e));
        }

        adsk.terminate();
    }
}

function stop(context) {
    var ui;
    try {
        var app = adsk.core.Application.get();
        ui = app.userInterface;
        var objArray = [];

        var commandControl_ = commandControlById(commandId);
        if (commandControl_) {
            objArray.push(commandControl_);
        }
        var commandDefinition_ = commandDefinitionById(commandId);
        if (commandDefinition_) {
            objArray.push(commandDefinition_);
        }

        objArray.forEach(function(obj){
            destroyObject(ui, obj);
        });

    } catch (e) {
        if (ui) {
            ui.messageBox('AddIn Stop Failed : ' + errorDescription(e));
        }
    }
}
