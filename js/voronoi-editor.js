//Author-Hans Kellner
//Description-Generate a voronoi sketch in Autodesk Fusion 360.

/*!
Copyright (C) 2020 Hans Kellner: https://github.com/hanskellner/Fusion360Voronoi
MIT License: See https://github.com/hanskellner/Fusion360Voronoi/LICENSE.md
*/

/*
This is a script for Autodesk Fusion 360 that generates Voronoi sketches.

This software makes use of the following:

- d3-delaunay library: https://github.com/d3/d3-delaunay
- paper.js
- jquery
- bootstrap
*/

$(function() {
    console.log( "Document ready!  Loading up the Dilithium crystals!" );

    // Amount to scale cell symbols so they better fit within cell.
    // Note, using LLoyd's relaxation will make the center of cells
    // more enclosed and this less necessary.
    const CELL_SYMBOL_SCALE_ADJUST = 0.8;

    // Default page sizes for standard (inches) and metric (centimeters)
    const DEFAULT_PAGE_WIDTH_STANDARD   = 11 - 1.5;     // letter - margins
    const DEFAULT_PAGE_HEIGHT_STANDARD  = 8.5 - 1.75;   // 

    const DEFAULT_PAGE_WIDTH_METRIC     = 29.7 - 1.9 - 1.32;    // A4 - margins
    const DEFAULT_PAGE_HEIGHT_METRIC    = 21 - 2.54 - 3.67;

    // Which units we support.  Note that Centimeters is the default for the
    // Fusion 360 API.  THerefore, that's what is used here.
    var UNITS = {
        Inches: 0,
        Centimeters: 1
    }

    /////////////////////////////////////////////////////////////////////////

    var _units = UNITS.Inches;
    var _sketchName = '';

    /////////////////////////////////////////////////////////////////////////

    function inches2pixels(val) { return (val * 96); }
    function pixels2inches(val) { return (val / 96); }

    function cms2pixels(val) { return inches2pixels(cms2inches(val)); }
    function pixels2cms(val) { return pixels2inches(inches2cms(val)); }
    
    function inches2cms(val) { return (val * 2.54); }
    function cms2inches(val) { return (val / 2.54); }

    $('#sidebarCollapse').on('click', function () {
        $('#sidebar').toggleClass('active');
    });

    $('#publishBtn').on('click', function () {
        sendEventPublishToFusion();
    });

    $('#closeBtn').on('click', function () {
        sendEventCloseDialogToFusion();
    });

    // For the cell count range
    const $valueSpanCellCount = $('#cellCountValueSpan');
    const $valueCellCount = $('#cellCountRange');
    $valueSpanCellCount.html($valueCellCount.val());
    $valueCellCount.on('input change', () => {
        $valueSpanCellCount.html($valueCellCount.val());
        drawVoronoi();
    });

    function propertyCellCount(defaultCount = 100) {
        var count = parseInt($valueCellCount.val());
        if (count !== NaN && count > 1 && count < 2000) {
            return count;
        }
        else {
            return defaultCount;
        }
    }

    // For the cell scale range
    const $valueSpanCellScale = $('#cellScaleValueSpan');
    const $valueCellScale = $('#cellScaleRange');
    $valueSpanCellScale.html($valueCellScale.val());
    $valueCellScale.on('input change', () => {
        $valueSpanCellScale.html($valueCellScale.val());
        drawVoronoi();
    });

    function propertyCellScale(defaultPct = 0.9) {
        var pct = parseInt($valueCellScale.val());
        return (pct !== NaN) ? pct / 100 : defaultPct;
    }

    // For the cell edge style
    const $valueCellEdgeStyle = $('#edgeStyleSelect');
    $valueCellEdgeStyle.change(() => {
        //var style = this.value;
        drawVoronoi();
    });

    const CellEdgeStyle = {
        Curved: 0,
        Straight: 1,
        Circle: 2,
        Square: 3,
        SquareRounded: 4,
        Star: 5,
        Triangle: 6,
        Pentagon: 7,
        Hexagon: 8,
        Octogon: 9
    };

    function propertyCellEdgeStyle(defaultStyle = CellEdgeStyle.Curved) {
        var style = $valueCellEdgeStyle.val();
        //$('#edgeStyleSelect option:selected').text();     // Get text value of selected options text
        return style;
    }

    // Units indicator
    const $valueUnitsIndicator = $('.units');
    function updatePropertyUnitsIndicator() {
        let formVal = (_units === UNITS.Inches) ? '(inches)' : '(cm)';
        $valueUnitsIndicator.text(formVal);
    }

    // Page width
    var _pageWidth = DEFAULT_PAGE_WIDTH_METRIC; // internally always cms

    const $valuePageWidth = $('#pageWidthInput');
    $valuePageWidth.on('input change', () => {
        var newVal = Number($valuePageWidth.val());
        if (newVal !== NaN && newVal > 0) {
            resizeVoronoi(true);
        }
    });

    // Return the page width (always in cms)
    function propertyPageWidth() {
        var val = Number($valuePageWidth.val());
        if (val === NaN || val <= 0) {
            return (_units === UNITS.Inches) ? inches2cms(_pageWidth) : _pageWidth; // Incoming is invalid so use current value
        }
        else {
            _pageWidth = (_units === UNITS.Inches) ? inches2cms(val) : val;
            return _pageWidth;
        }
    }

    // Set the page width (always in cms)
    function setPropertyPageWidth(val) {
        _pageWidth = val;

        // Form display value in selected units
        let formVal = (_units === UNITS.Inches) ? cms2inches(val) : val;
        $valuePageWidth.val(Number(formVal.toFixed(2)));
    }

    // Page height
    var _pageHeight = DEFAULT_PAGE_HEIGHT_METRIC; // internally always in cms

    const $valuePageHeight = $('#pageHeightInput');
    $valuePageHeight.on('input change', () => {
        var newVal = Number($valuePageHeight.val());
        if (newVal !== NaN && newVal > 0) {
            resizeVoronoi(true);
        }
    });

    // Return the page height (always in cms)
    function propertyPageHeight() {
        var val = Number($valuePageHeight.val());
        if (val === NaN || val <= 0) {
            return (_units === UNITS.Inches) ? inches2cms(_pageHeight) : _pageHeight; // Incoming is invalid so use current value
        }
        else {
            _pageHeight = (_units === UNITS.Inches) ? inches2cms(val) : val;
            return _pageHeight;
        }
    }

    // Set the page height (always in cms)
    function setPropertyPageHeight(val) {
        _pageHeight = val;

        // Form display value in selected units
        let formVal = (_units === UNITS.Inches) ? cms2inches(val) : val;
        $valuePageHeight.val(Number(formVal.toFixed(2)));
    }

    // Units
    function propertyUnits() {
        return _units;
    }

    function setPropertyUnits(val, force = false) {
        if (val === UNITS.Inches || val === UNITS.Centimeters) {
            if (force || _units != val) {
                _units = val;
                updatePropertyUnitsIndicator();

                // Set defaults for the unit
                switch (_units) {
                    case UNITS.Inches:
                        setPropertyPageWidth(inches2cms(DEFAULT_PAGE_WIDTH_STANDARD));
                        setPropertyPageHeight(inches2cms(DEFAULT_PAGE_HEIGHT_STANDARD));
                        break
                    case UNITS.Centimeters:
                        setPropertyPageWidth(DEFAULT_PAGE_WIDTH_METRIC);
                        setPropertyPageHeight(DEFAULT_PAGE_HEIGHT_METRIC);
                        break
                }
            }
        }
    }

    setPropertyUnits(propertyUnits(), true);

    // Show Page Border

    const $valueShowPageBorder = $('#pageBorderCheckbox');
    $valueShowPageBorder.change( () => {
        drawVoronoi();
    });    

    function propertyShowPageBorder() {
        return ($valueShowPageBorder.is(":checked"));
    }

    function setPropertyShowPageBorder(val) {
        $valueShowPageBorder.prop( "checked", val );
    }

    // For the view scale range
    const $valueSpanViewScale = $('#viewScaleValueSpan');
    const $valueViewScale = $('#viewScaleRange');
    $valueSpanViewScale.html($valueViewScale.val());
    $valueViewScale.on('input change', () => {
        $valueSpanViewScale.html($valueViewScale.val());
        scaleView();
    });

    function propertyViewScale(defaultScale = 1) {
        var val = parseInt($valueViewScale.val());
        return (val !== NaN && val !== 0) ? val/100 : defaultScale;
    }

    // Sketch name
    function propertySketchName() {
        return _sketchName;
    }

    function setPropertySketchName(name) {
        _sketchName = name;
    }

    /////////////////////////////////////////////////////////////////////////
    // Random Numbers

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
    function nextRandomNumber() {
        lastRandom = (lastRandom * 9301 + 49297) % 233280;
        var randomNumber = lastRandom / 233280;
        return randomNumber;
    }

    // prime the random number generator
    var seed = new Date().getTime();
    lastRandom = primeNumbers[(seed % primeNumbers.length)] * seed;

    /////////////////////////////////////////////////////////////////////////
    // Lloyd's Relaxation Support

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
    const getSiteDistance = (a, b) => Math.sqrt(Math.pow(a[0]-b[0], 2)+Math.pow(a[1]-b[1], 2))
    
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
    
    /////////////////////////////////////////////////////////////////////////
    // Cell site generation

    // Bounds of cell points
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;

    function generateCellSites(count) {
        // TODO: Make this a user setting
        var padding = 5;    // px

        var pageWidthInner = (cms2pixels(propertyPageWidth()) - 2*padding);
        var pageHeightInner = (cms2pixels(propertyPageHeight()) - 2*padding);

        //console.log("Page Width = " + cms2pixels(propertyPageWidth()) + " Height = " + cms2pixels(propertyPageHeight()));
        //console.log("Page Inner Width = " + pageWidthInner + " Height = " + pageHeightInner);

        // Create a set of random cell sites.  These are center points of each cell.
        var sites = [];
        for (var iCells = 0; iCells < count; ++iCells) {
            var site = [nextRandomNumber() * pageWidthInner + padding, nextRandomNumber() * pageHeightInner + padding];
            sites.push(site);
        }

        // Find bounds of the points
        minX = Infinity;
        minY = Infinity;
        maxX = -Infinity;
        maxY = -Infinity;

        for (var i = 0; i < sites.length; i++) {
            var x = sites[i][0];
            var y = sites[i][1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        return sites;
    }

    /////////////////////////////////////////////////////////////////////////

    const POINT_OP = {Add: 0, Sub: 1, Div: 2, Mul: 3};

    // HACK!  Used for paper point ops.
    // OP: arg1 OP arg2
    // Add: point + point
    // Sub: point - point
    // Div: point / num
    // Mul: point * num
    function pointOp(arg1, arg2, op) {
        switch (op) {
            case POINT_OP.Add:
                return new paper.Point(arg1.x + arg2.x, arg1.y + arg2.y);
            case POINT_OP.Sub:
                return new paper.Point(arg1.x - arg2.x, arg1.y - arg2.y);
            case POINT_OP.Div:
                return new paper.Point(arg1.x / arg2, arg1.y / arg2);
            case POINT_OP.Mul:
                return new paper.Point(arg1.x * arg2, arg1.y * arg2);
            }
        return null;
    }

    function removeSmallBits(path) {
        var min = path.length / 50;
        for (var i = path.segments.length - 1; i >= 0; i--) {
            var segment = path.segments[i];
            var cur = segment.point;
            var nextSegment = segment.next;
            var next = nextSegment.point + nextSegment.handleIn;
            if (cur.getDistance(next) < min) {
                segment.remove();
            }
        }
    }

    function createPath(points, center) {

        var path = null;
        var minDistance = Infinity; // Used for shapes
        
        var edgeStyle = propertyCellEdgeStyle();

        if (edgeStyle == CellEdgeStyle.Curved || edgeStyle == CellEdgeStyle.Straight) {
            path = new paper.Path();
            path.strokeColor = 'black';
            if (!cellSelected) {
                path.fillColor = cellColor;
            } else {
                path.fullySelected = true;
            }
            path.closed = true;
        }

        var pointCenter = new paper.Point(center[0], center[1]);

        for (var i = 0, l = points.length; i < l; i++) {
            var point = points[i];

            if (edgeStyle == CellEdgeStyle.Curved) {
                var next = points[(i + 1) == points.length ? 0 : i + 1];
                var vector = pointOp(pointOp(next, point, POINT_OP.Sub), 2, POINT_OP.Div);
                path.add({
                    point: pointOp(point, vector, POINT_OP.Add),
                    handleIn: pointOp(vector, -1, POINT_OP.Mul),
                    handleOut: vector
                });
            }
            else if (edgeStyle == CellEdgeStyle.Straight) {
                path.add(point);
            }
            else { // if (edgeStyle == CellEdgeStyle.Star) {
                // Keep track of min distance from center to points
                var d = getDistance(pointCenter, point);
                if (d < minDistance) {
                    minDistance = d;
                }
            }
        }

        // Need to make a shape?
        if (minDistance !== Infinity) {
            if (edgeStyle == CellEdgeStyle.Circle) {
                path = new paper.Path.Circle(pointCenter, minDistance);
            }
            else if (edgeStyle == CellEdgeStyle.Square) {
                path = new paper.Path.Rectangle(pointCenter, new paper.Size(minDistance,minDistance));
            }
            else if (edgeStyle == CellEdgeStyle.SquareRounded) {
                path = new paper.Path.Rectangle(new paper.Rectangle(pointCenter, new paper.Size(minDistance, minDistance)), new paper.Size(minDistance*0.2, minDistance*0.2));
            }
            else if (edgeStyle == CellEdgeStyle.Star) {
                path = new paper.Path.Star(pointCenter, 6, minDistance*0.5, minDistance);
            }
            else if (edgeStyle == CellEdgeStyle.Triangle) {
                path = new paper.Path.RegularPolygon(pointCenter, 3, minDistance);
            }
            else if (edgeStyle == CellEdgeStyle.Pentagon) {
                path = new paper.Path.RegularPolygon(pointCenter, 5, minDistance);
            }
            else if (edgeStyle == CellEdgeStyle.Hexagon) {
                path = new paper.Path.RegularPolygon(pointCenter, 6, minDistance);
            }
            else if (edgeStyle == CellEdgeStyle.Octogon) {
                path = new paper.Path.RegularPolygon(pointCenter, 8, minDistance);
            }

            if (path !== null) {
                path.rotate(Math.random() * 360);
                path.scale(propertyCellScale() * CELL_SYMBOL_SCALE_ADJUST, propertyCellScale() * CELL_SYMBOL_SCALE_ADJUST);
                path.strokeColor = 'black';
                if (!cellSelected) {
                    path.fillColor = cellColor;
                } else {
                    path.fullySelected = true;
                }
            }
        }
        else {
            path.scale(propertyCellScale());
            removeSmallBits(path);
        }

        return path;
    }

    function renderDiagram(sites) {
        paper.project.activeLayer.removeChildren();
        
        //console.time('delaunay');
        var delaunay = d3.Delaunay.from(sites);
        //console.timeEnd('delaunay');
        
        var voronoi = delaunay.voronoi([minX,minY,maxX,maxY]);
        if (voronoi) {

            // TODO: Perform Lloyd's Relaxation
            //for (var iRelax = 0; iRelax < 10; ++iRelax) {
            //    relax(voronoi);
            //    //var voronoi = delaunay.voronoi([minX,minY,maxX,maxY]);
            //}

            for (var i = 0, l = sites.length; i < l; i++) {
                var cellPoly = voronoi.cellPolygon(i);
                if (cellPoly) {
                    var points = [];
                    for (var j = 0; j < cellPoly.length - 1; j++) { // Ignore last point since dup of x0,y0
                        points.push(new paper.Point(cellPoly[j][0], cellPoly[j][1]));
                    }

                    createPath(points, sites[i]);
                }
            }

            // Draw page bounds
            if (propertyShowPageBorder()) {
                var pathBounds = new paper.Path.Rectangle(new paper.Point(0,0), new paper.Point(cms2pixels(propertyPageWidth()), cms2pixels(propertyPageHeight())));
                pathBounds.strokeColor = 'darkgray';
            }

            paper.view.draw();
        }
    }

    /////////////////////////////////////////////////////////////////////////

    var scaleLast = 1;

    function scaleView() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var scale = propertyViewScale();
        unscaleView();   // Restore then scale
        paper.view.scale(scale, new paper.Point(0, 0));
        scaleLast = scale;
    }

    function unscaleView() {
        paper.view.scale(1/scaleLast, new paper.Point(0, 0));
    }

    /////////////////////////////////////////////////////////////////////////

    var cellSites = [];
    var cellSitesCount = 0;

    function drawVoronoi(forceCellUpdate = false) {

        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Need to update cell sites?
        var newCellSitesCount = propertyCellCount();
        if (forceCellUpdate || cellSitesCount !== newCellSitesCount) {
            cellSites = generateCellSites(newCellSitesCount);
            cellSitesCount = cellSites.length;
        }

        renderDiagram(cellSites);
    }

    function resizeCanvas() {

        // If sidebar is visible we reduce to fit; otherwise no reduction
        var canvasWidthMargin = 310;    // px
        var sidebarLeftMargin = parseInt($('#sidebar').css('margin-left'), 10);
        if (sidebarLeftMargin == NaN || sidebarLeftMargin !== 0) {
            canvasWidthMargin = 60;
        }

        // Determine the displayed size (in css pixels)
        var canvasWidth = Math.max((window.innerWidth - canvasWidthMargin), 400);
        var canvasHeight = Math.max((window.innerHeight - 135), 135);
    
        // Set visible size (css pixels).
        canvas.style.width = canvasWidth + "px";
        canvas.style.height = canvasHeight + "px";

        // Now set the drawing buffer size based on the requested page size
        var pageWidthInPixels = cms2pixels(propertyPageWidth());
        var pageHeightInPixels = cms2pixels(propertyPageHeight());

        // Determine the scale factor so that the drawing buffer is displayed correctly
        // in the visible size
        var scalex = canvasWidth / pageWidthInPixels;
        var scaley = canvasHeight / pageHeightInPixels;

        canvas.width = pageWidthInPixels * scalex;
        canvas.height = pageHeightInPixels * scaley;

        // TODO: SEE: https://matthiasberth.com/tech/stable-zoom-and-pan-in-paperjs
        //paper.project.activeLayer.position = paper.view.bounds.center;
    }

    /////////////////////////////////////////////////////////////////////////
    // Initialize canvas and paper.js
    
    var cellColor = new paper.Color('lightblue');
    var cellSelected = false;

    var canvas = document.getElementById('voronoiCanvas');
    var ctx = canvas.getContext('2d');

    // Now set the drawing buffer size based on the requested page size
    canvas.width = cms2pixels(propertyPageWidth());
    canvas.height = cms2pixels(propertyPageHeight());

    console.log("Canvas size = " + canvas.width + " x " + canvas.height );

    // Create an empty project and a view for the canvas.  And do it
    // after we've set the canvas size.
    paper.setup(canvas);

    // resize the canvas to match browser window
    window.addEventListener('resize', resizeHandler, false);

    function resizeHandler() {
        resizeVoronoi();
    }

    // This can't be called by the resize event since it will pass an object as a param which
    // will be used as the forceCellUpdate param.
    function resizeVoronoi(forceCellUpdate = false) {
        resizeCanvas();
        drawVoronoi(forceCellUpdate);
    }

    resizeVoronoi();    // Show me the money!

    // Queue up event to tell Fusion we are alive
    setTimeout(sendEventStartedToFusion, 250);

    /////////////////////////////////////////////////////////////////////////
    // Fusion 360 Add-In Support Section

    function handleActionStarted(jsonStr) {
        var jsonData = JSON.parse(jsonStr);
        if (jsonData) {
            // Look for properties
            if (typeof jsonData.sketchName !== 'undefined') {
                setPropertySketchName(jsonData.sketchName);
            }

            if (typeof jsonData.units !== 'undefined') {
                if (jsonData.units === 'in')
                    setPropertyUnits(UNITS.Inches);
                else if (jsonData.units === 'cm')
                    setPropertyUnits(UNITS.Centimeters);
            }

            if (typeof jsonData.width !== 'undefined') {
                setPropertyPageWidth(jsonData.width);
            }

            if (typeof jsonData.height !== 'undefined') {
                setPropertyPageHeight(jsonData.height);
            }
        }
        else {
            console.log("Failed to parse json: " + jsonStr);
        }
    }

    function sendEventStartedToFusion() {

        if (typeof adsk === 'undefined') {
            return; // Not running in Fusion 360
        }

        // Package up data as JSON
        var jsonDataStr = `{
            "action": "started",
            "arguments": {}
        }`;

        var retVal = adsk.fusionSendData('send', jsonDataStr);
        if (retVal !== null) {
            console.log("started event: return value = ", retVal);
            handleActionStarted(retVal);
        }
    }

    // Send data to Fusion
    function sendEventPublishToFusion() {

        if (typeof adsk === 'undefined') {
            return; // Not running in Fusion 360
        }

        // First reset to default scaling
        var prevScale = propertyViewScale();
        unscaleView();

        // Get the SVG
        var svg = paper.project.exportSVG({asString:true});
        if (svg === null || svg === '') {
            console.log("No SVG generated.");
            return;
        }

        // Restore scale
        scaleView(prevScale);

        var svgString = encodeURIComponent(svg);
        var svgWidth = propertyPageWidth();
        var svgHeight = propertyPageHeight();
        var sketchName = propertySketchName('');

        // Package up data as JSON
        var jsonDataStr = `{
            "action": "publish",
            "arguments": {
                "sketchName" : "${sketchName}",
                "svg" : "${svgString}",
                "width": "${svgWidth}",
                "height": "${svgHeight}"
            }
        }`;

        //console.log("sendEventPublishToFusion() - Data generated:");
        //console.log(jsonDataStr);
        adsk.fusionSendData('send', jsonDataStr);
    }

    function sendEventCloseDialogToFusion() {

        if (typeof adsk === 'undefined') {
            return; // Not running in Fusion 360
        }

        // Package up data as JSON
        var jsonDataStr = `{
            "action": "close",
            "arguments": {}
        }`;

        adsk.fusionSendData('send', jsonDataStr);
    }

    // Receive from Fusion at start
    window.fusionJavaScriptHandler = {
        handle: function(action, data) {
            try {
                //console.log("Fusion sent action '" + action + "' with data: " + data);

                // Initialize the editor?
                if (action == 'init') {
                    if (data !== null) {
                        handleActionStarted(data);
                    }
                }
                else if (action == 'debugger') {
                    debugger;
                }
                else {
                    console.log('Unexpected action: ' + action);
                }
                return 'OK';
            }
            catch (e) {
                console.log(e);
                console.log('exception caught with action: ' + action + ', data: ' + data);
                return 'FAILED';
            }
        }
    };
});