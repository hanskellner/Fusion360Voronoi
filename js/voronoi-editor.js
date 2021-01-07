//Author-Hans Kellner
//Description-Generate a voronoi sketch in Autodesk Fusion 360.

/*!
Copyright (C) 2020 Hans Kellner: https://github.com/hanskellner/Fusion360Voronoi
MIT License: See https://github.com/hanskellner/Fusion360Voronoi/LICENSE.md
*/

/*
This is a script for Autodesk Fusion 360 that generates Voronoi sketches.

This software makes use of the following:

- d3-delaunay : https://github.com/d3/d3-delaunay
- d3-polygon : https://github.com/d3/d3-polygon
- paper.js : http://paperjs.org/
- jquery
- bootstrap
*/

$(function() {
    console.log( "Document ready!  Loading up the Dilithium crystals!" );

    // The default number of iterations for Lloyd's relaxation
    const DEFAULT_LLOYDS_ITERATIONS = 20;

    // Value determines how fast Lloyd's relaxtion occurs each iteration
    const LLOYDS_OMEGA = 0.2;

    // Default page sizes for standard (inches) and metric (centimeters)
    const DEFAULT_PAGE_WIDTH_STANDARD   = 11 - 1.5;     // letter - margins
    const DEFAULT_PAGE_HEIGHT_STANDARD  = 8.5 - 1.75;   // 

    const DEFAULT_PAGE_WIDTH_METRIC     = 29.7 - 1.9 - 1.32;    // A4 - margins
    const DEFAULT_PAGE_HEIGHT_METRIC    = 21 - 2.54 - 3.67;

    // Which units we support.  Note that Centimeters is the default for the
    // Fusion 360 API.  THerefore, that's what is used here.
    var UNITS = {
        Inches: 'in',
        Centimeters: 'cm'
    }

    //var TEST_PROFILE = '[[{"x":"12.7","y":"7.62"}, {"x":"12.7","y":"7.82"}, {"x":"12.68","y":"8.02"}, {"x":"12.66","y":"8.219"}, {"x":"12.64","y":"8.417"}, {"x":"12.6","y":"8.614"}, {"x":"12.56","y":"8.809"}, {"x":"12.51","y":"9.002"}, {"x":"12.45","y":"9.194"}, {"x":"12.38","y":"9.383"}, {"x":"12.31","y":"9.569"}, {"x":"12.23","y":"9.752"}, {"x":"12.14","y":"9.932"}, {"x":"12.05","y":"10.11"}, {"x":"11.95","y":"10.28"}, {"x":"11.84","y":"10.45"}, {"x":"11.73","y":"10.61"}, {"x":"11.6","y":"10.77"}, {"x":"11.48","y":"10.93"}, {"x":"11.34","y":"11.08"}, {"x":"11.2","y":"11.22"}, {"x":"11.06","y":"11.36"}, {"x":"10.91","y":"11.49"}, {"x":"10.76","y":"11.62"}, {"x":"10.6","y":"11.74"}, {"x":"10.43","y":"11.85"}, {"x":"10.26","y":"11.96"}, {"x":"10.09","y":"12.06"}, {"x":"9.914","y":"12.15"}, {"x":"9.733","y":"12.24"}, {"x":"9.55","y":"12.32"}, {"x":"9.363","y":"12.39"}, {"x":"9.174","y":"12.46"}, {"x":"8.983","y":"12.51"}, {"x":"8.789","y":"12.56"}, {"x":"8.594","y":"12.61"}, {"x":"8.397","y":"12.64"}, {"x":"8.198","y":"12.67"}, {"x":"7.999","y":"12.69"}, {"x":"7.8","y":"12.7"}, {"x":"7.6","y":"12.7"}, {"x":"7.4","y":"12.7"}, {"x":"7.2","y":"12.68"}, {"x":"7.001","y":"12.66"}, {"x":"6.803","y":"12.63"}, {"x":"6.606","y":"12.6"}, {"x":"6.411","y":"12.55"}, {"x":"6.218","y":"12.5"}, {"x":"6.027","y":"12.44"}, {"x":"5.838","y":"12.38"}, {"x":"5.652","y":"12.3"}, {"x":"5.47","y":"12.22"}, {"x":"5.29","y":"12.13"}, {"x":"5.114","y":"12.04"}, {"x":"4.942","y":"11.94"}, {"x":"4.774","y":"11.83"}, {"x":"4.611","y":"11.71"}, {"x":"4.452","y":"11.59"}, {"x":"4.298","y":"11.46"}, {"x":"4.15","y":"11.33"}, {"x":"4.006","y":"11.19"}, {"x":"3.869","y":"11.05"}, {"x":"3.737","y":"10.9"}, {"x":"3.611","y":"10.74"}, {"x":"3.491","y":"10.58"}, {"x":"3.378","y":"10.41"}, {"x":"3.271","y":"10.25"}, {"x":"3.171","y":"10.07"}, {"x":"3.078","y":"9.895"}, {"x":"2.992","y":"9.715"}, {"x":"2.913","y":"9.531"}, {"x":"2.842","y":"9.344"}, {"x":"2.777","y":"9.155"}, {"x":"2.721","y":"8.963"}, {"x":"2.672","y":"8.769"}, {"x":"2.63","y":"8.574"}, {"x":"2.597","y":"8.376"}, {"x":"2.571","y":"8.178"}, {"x":"2.553","y":"7.979"}, {"x":"2.542","y":"7.779"}, {"x":"2.54","y":"7.62"}], [{"x":"2.54","y":"7.62"}, {"x":"2.54","y":"2.54"}], [{"x":"2.54","y":"2.54"}, {"x":"12.7","y":"2.54"}], [{"x":"12.7","y":"2.54"}, {"x":"12.7","y":"7.62"}]]';
    //var TEST_INIT_FROM_FUSION = '{"units": "in", "width": "10.0", "height": "7.5", "profile": []}';
    
    /////////////////////////////////////////////////////////////////////////

    var _profileData = [];      // Array of arrays.  Each child array is a path

    var _profileBounds = {
        xmin: Infinity,
        ymin: Infinity,
        xmax: -Infinity,
        ymax: -Infinity
    }

    var _profilePath = null;    // Paper Path

    var _cellSites = [];
    var _cellSitesCount = 0;

    var _cellSitesRelaxed = [];     // Llloyd's relaxed cell sites

    var _lloydsCounter = 0;

    var _delaunay = null;
    var _voronoi = null;

    // TESTING PROFILE
    //var jsonProfile = JSON.parse(TEST_PROFILE);
    //setPropertyProfile(jsonProfile);
    
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

    $('#publishToFusionBtn').on('click', function () {
        sendEventPublishToFusion();
    });

    $('#downloadSVGBtn').on('click', function() {
        var svg = generateSVG();

        if (svg === null || svg === '') {
            // TODO: Display error to user.
            console.log("No SVG generated.");
            return;
        }

        // create a blob url representing the data
        var blob = new Blob([svg]);
        var blob_url = window.URL.createObjectURL(blob);

        // attach blob url to anchor element with download attribute
        var anchor = document.createElement('a');
        anchor.setAttribute('href', blob_url);
        anchor.setAttribute('download', 'voronoi.svg');
        anchor.setAttribute('target', '_blank');
        anchor.click();
        window.URL.revokeObjectURL(blob_url);
    });

    function showDebugText(str) {
        $('#debug_text').html(str);
    }

    // For the cell count range
    const $valueSpanCellCount = $('#cellCountValueSpan');
    const $valueCellCount = $('#cellCountRange');
    $valueSpanCellCount.html($valueCellCount.val());
    $valueCellCount.on('input change', () => {
        $valueSpanCellCount.html($valueCellCount.val());
        generateCells();
        updateView();
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
        updateView();
    });

    function propertyCellScale(defaultPct = 0.9) {
        var pct = parseInt($valueCellScale.val());
        return (pct !== NaN) ? pct / 100 : defaultPct;
    }

    // For the cell edge style
    const $valueCellEdgeStyle = $('#edgeStyleSelect');
    $valueCellEdgeStyle.change(() => {
        //var style = this.value;
        updateView();
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

    // Page width
    var _pageWidth = DEFAULT_PAGE_WIDTH_METRIC; // internally always centimeters

    // Return the page width (always in cms)
    function propertyPageWidth() {
        return _pageWidth;
    }

    // Set the page width (always centimeters)
    // Callers must call resizeCanvas() afterwards.
    function setPropertyPageWidth(val) {
        _pageWidth = val;
        //resizeCanvas();
    }

    // Page height
    var _pageHeight = DEFAULT_PAGE_HEIGHT_METRIC; // internally always in centimeters

    // Return the page height (always in cms)
    function propertyPageHeight() {
        return _pageHeight;
    }

    // Set the page height (always centimeters)
    // Callers must call resizeCanvas() afterwards.
    function setPropertyPageHeight(val) {
        _pageHeight = val;
        //resizeCanvas();
    }

    // Padding between border and voronoi (centimeters)
    var _padding = 0;

    const $valuePagePadding = $('#pagePaddingInput');
    $valuePagePadding.on('input change', () => {
        var newVal = propertyPagePadding();
        
        // Make sure padding isn't too large
        var pageWidth = propertyPageWidth();
        var pageHeight = propertyPageHeight();
        if (pageWidth > pageHeight) {
            newVal = Math.min(pageHeight/4, newVal);
        }
        else {
            newVal = Math.min(pageWidth/4, newVal);
        }
    
        if (newVal !== _padding) {
            console.log(newVal);
            _padding = newVal;
            forceUpdate();
        }
        else {
            setPropertyPagePadding(newVal); // In case set larger than allowed
        }
    });

    // Return the page padding (always in cms)
    function propertyPagePadding() {
        var val = Number($valuePagePadding.val());
        if (val === NaN || val < 0) {
            return _padding; // Incoming is invalid so use current value
        }
        else {
            // REVIEW: Set the local var _padding too?
            return (propertyUnits() === UNITS.Inches) ? inches2cms(val) : val;  // Need to convert to cms internally
        }
    }

    // Set the page padding (always in cms)
    function setPropertyPagePadding(val) {
        _padding = val; // TODO: Validate

        // Form display value in selected units
        let formVal = (propertyUnits() === UNITS.Inches) ? cms2inches(val) : val;
        $valuePagePadding.val(Number(formVal.toFixed(2)));
    }

    // Number of iterations for Lloyd's Relaxation
    var _lloydsRelaxation = 0;

    const $valueSpanLloyds = $('#lloydsValueSpan');
    const $valueLloyds = $('#lloydsRange');
    $valueSpanLloyds.html($valueLloyds.val());
    $valueLloyds.on('input change', () => {
        $valueSpanLloyds.html($valueLloyds.val());

        var newVal = Number($valueLloyds.val());
        if (newVal !== _lloydsRelaxation) {
            _lloydsRelaxation = newVal;

            setLloydsCounter(_lloydsRelaxation);

            // Save original sites so that relaxation applied to copy.
            // REVIEW: MOve this logic elsewhere
            initRelaxedCellSites();
            
            updateView();
        }
    });

    // Return the number of iterations for Lloyd's Relaxation
    function propertyLloyds() {
        return _lloydsRelaxation;
    }

    // Set the number of iterations for Lloyd's Relaxation
    function setPropertyLloyds(val) {
        _lloydsRelaxation = val;
        $valueLloyds.val(val);
        $valueSpanLloyds.html(val);

        setLloydsCounter(_lloydsRelaxation);

        // Save original sites so that relaxation applied to copy.
        // REVIEW: MOve this logic elsewhere
        initRelaxedCellSites();
    }

    setPropertyLloyds(DEFAULT_LLOYDS_ITERATIONS);

    // Units indicator
    const $valueUnitsIndicator = $('.units');
    function updatePropertyUnitsIndicator() {
        let formVal = (propertyUnits() === UNITS.Inches) ? '(inches)' : '(cm)';
        $valueUnitsIndicator.text(formVal);
    }

    // Units
    var _units = UNITS.Centimeters;

    function propertyUnits() {
        return _units;
    }

    function setPropertyUnits(val) {
        if (val == 'in' || val != 'ft')
            _units = UNITS.Inches;
        else
            _units = UNITS.Centimeters;

        updatePropertyUnitsIndicator();
    }

    updatePropertyUnitsIndicator();

    // Profile
    function propertyProfile() {
        return _profileData;
    }

    function setPropertyProfile(profile) {
        var isClippingDisabled = true;

        if (profile !== undefined && profile !== null) {
            _profileData = profile;

            // Calc bouds of profile
            _profileBounds.xmin = Infinity;
            _profileBounds.ymin = Infinity;
            _profileBounds.xmax = -Infinity;
            _profileBounds.ymax = -Infinity;

            if (_profileData.length > 0) {
                isClippingDisabled = false;

                for (var iPath = 0; iPath < _profileData.length; ++iPath) {
                    var path = _profileData[iPath];
                    for (var iPt = 0; iPt < path.length; ++iPt) {
                        var x = Number(path[iPt].x)
                        var y = Number(path[iPt].y)
                        if (x < _profileBounds.xmin) _profileBounds.xmin = x;
                        if (y < _profileBounds.ymin) _profileBounds.ymin = y;
                        if (x > _profileBounds.xmax) _profileBounds.xmax = x;
                        if (y > _profileBounds.ymax) _profileBounds.ymax = y;
                    }
                }
            }
        }

        $valueClipCellsOutside.prop( "disabled", isClippingDisabled );
        $valueClipCellsIntersect.prop( "disabled", isClippingDisabled );
    }

    // Clip Outside and Intersect Profile

    const $valueClipCellsOutside = $('#clipCellsOutsideCheckbox');
    $valueClipCellsOutside.change( () => {
        updateView();
    });    

    function propertyClipCellsOutside() {
        return ($valueClipCellsOutside.is(":checked"));
    }

    function setPropertyClipCellsOutside(val) {
        $valueClipCellsOutside.prop( "checked", val );
    }

    const $valueClipCellsIntersect = $('#clipCellsIntersectCheckbox');
    $valueClipCellsIntersect.change( () => {
        updateView();
    });    

    function propertyClipCellsIntersect() {
        return ($valueClipCellsIntersect.is(":checked"));
    }

    function setPropertyClipCellsIntersect(val) {
        $valueClipCellsIntersect.prop( "checked", val );
    }

    // Show Page Border
    const $valueShowPageBorder = $('#pageBorderCheckbox');
    $valueShowPageBorder.change( () => {
        updateView();
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
    // Voronoi generation

    function cellSitesCount() {
        return _cellSitesRelaxed.length;
    }

    function cellSiteAt(index) {
        return _cellSitesRelaxed[index];
    }

    function setCellSiteAt(index, x, y) {
        _cellSitesRelaxed[index][0] = x;
        _cellSitesRelaxed[index][1] = y;
    }

    function initRelaxedCellSites() {
        if (_cellSites.length > 0) {
            if (_cellSitesRelaxed.length !== _cellSites.length) {
                _cellSitesRelaxed = new Array(_cellSites.length);
            }
            for (var i = 0; i < _cellSites.length; i++) {
                _cellSitesRelaxed[i] = [_cellSites[i][0], _cellSites[i][1]];
            }
            // Shortcut but expensive.
            //_cellSitesRelaxed = JSON.parse(JSON.stringify(_cellSites));
        }
        else {
            _cellSitesRelaxed = [];
        }
    }

    function lloydsCounter() {
        return _lloydsCounter;
    }

    function setLloydsCounter(val) {
        _lloydsCounter = val;
    }

    function generateVoronoi() {

        //console.time('delaunay');
        _delaunay = d3.Delaunay.from(_cellSitesRelaxed);
        //console.timeEnd('delaunay');

        _voronoi = _delaunay.voronoi([_xMinCellSites,_yMinCellSites,_xMaxCellSites,_yMaxCellSites]);
    }


    /////////////////////////////////////////////////////////////////////////
    // Cell site generation

    const getDistance = (a, b) => Math.sqrt(Math.pow(a.x-b.x, 2)+Math.pow(a.y-b.y, 2))
    const getSiteDistance = (a, b) => Math.sqrt(Math.pow(a[0]-b[0], 2)+Math.pow(a[1]-b[1], 2))

    // Bounds of cell points
    var _xMinCellSites = Infinity;
    var _yMinCellSites = Infinity;
    var _xMaxCellSites = -Infinity;
    var _yMaxCellSites = -Infinity;

    function generateCellSites(count) {

        var pageWidth = cms2pixels(propertyPageWidth());
        var pageHeight = cms2pixels(propertyPageHeight());
        var padding = cms2pixels(propertyPagePadding());

        if (pageWidth > pageHeight)
            padding = Math.min(pageHeight/4, padding);
        else
            padding = Math.min(pageWidth/4, padding);

        var pageWidthInner = (pageWidth - 2*padding);
        var pageHeightInner = (pageHeight - 2*padding);

        //console.log("Page Width = " + pageWidth + " Height = " + pageHeight);
        //console.log("Page Inner Width = " + pageWidthInner + " Height = " + pageHeightInner);

        // Create a set of random cell sites.  These are center points of each cell.
        var sites = [];
        for (var iCells = 0; iCells < count; ++iCells) {
            var site = [nextRandomNumber() * pageWidthInner + padding, nextRandomNumber() * pageHeightInner + padding];
            sites.push(site);
        }

        // Find bounds of the points
        _xMinCellSites = Infinity;
        _yMinCellSites = Infinity;
        _xMaxCellSites = -Infinity;
        _yMaxCellSites = -Infinity;

        for (var i = 0; i < sites.length; i++) {
            const x = sites[i][0];
            const y = sites[i][1];
            if (x < _xMinCellSites) _xMinCellSites = x;
            if (y < _yMinCellSites) _yMinCellSites = y;
            if (x > _xMaxCellSites) _xMaxCellSites = x;
            if (y > _yMaxCellSites) _yMaxCellSites = y;
        }

        return sites;
    }

    function generateCells(forceCellUpdate = false) {
        // Need to update cell sites?
        var newCellSitesCount = propertyCellCount();
        if (forceCellUpdate || _cellSitesCount !== newCellSitesCount) {
            _cellSites = generateCellSites(newCellSitesCount);
            _cellSitesCount = _cellSites.length;

            // Save original sites so that relaxation applied to copy.
            initRelaxedCellSites();

            //var cellSitesRelaxed = JSON.parse(JSON.stringify(_cellSites));
            //console.log(cellSitesRelaxed);
            //console.log(_cellSites);

            generateVoronoi();

            setLloydsCounter(propertyLloyds());
        }
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

    function createVoronoiPath(index) {

        var cell = _voronoi.cellPolygon(index);
        if (cell == null) return null;

        var points = [];
        for (var j = 0; j < cell.length - 1; j++) { // Ignore last point since dup of x0,y0
            points.push(new paper.Point(cell[j][0], cell[j][1]));
        }

        var path = null;
        var isSymbol = false;

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
        else {
            isSymbol = true;
        }

        const center = cellSiteAt(index);

        if (!isSymbol) {
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
            }

            path.scale(propertyCellScale());
            removeSmallBits(path);
        }
        else {
            var minDistance = Infinity; // Used for shapes/symbols

            for (const j of _voronoi.neighbors(index)) {
                // Keep track of min distance from center to neighbor centers
                const centerN = cellSiteAt(j);
                var d = getSiteDistance(center, centerN);
                if (d < minDistance) {
                    minDistance = d;
                }
            }

            // Need to make a shape?
            if (minDistance !== Infinity) {
                var pointCenter = new paper.Point(center[0], center[1]);
                
                var halfDist = minDistance/2;

                if (edgeStyle == CellEdgeStyle.Circle) {
                    path = new paper.Path.Circle(pointCenter, halfDist);
                }
                else if (edgeStyle == CellEdgeStyle.Square) {
                    path = new paper.Path.Rectangle(
                        new paper.Point(pointCenter.x - halfDist, pointCenter.y - halfDist),
                        new paper.Size(minDistance, minDistance));
                }
                else if (edgeStyle == CellEdgeStyle.SquareRounded) {
                    var rect = new paper.Rectangle(
                        new paper.Point(pointCenter.x - halfDist, pointCenter.y - halfDist),
                        new paper.Size(minDistance, minDistance));
                    path = new paper.Path.Rectangle(rect, new paper.Size(minDistance*0.2, minDistance*0.2));
                }
                else if (edgeStyle == CellEdgeStyle.Star) {
                    path = new paper.Path.Star(pointCenter, 6, halfDist*0.5, halfDist);
                }
                else if (edgeStyle == CellEdgeStyle.Triangle) {
                    path = new paper.Path.RegularPolygon(pointCenter, 3, halfDist);
                }
                else if (edgeStyle == CellEdgeStyle.Pentagon) {
                    path = new paper.Path.RegularPolygon(pointCenter, 5, halfDist);
                }
                else if (edgeStyle == CellEdgeStyle.Hexagon) {
                    path = new paper.Path.RegularPolygon(pointCenter, 6, halfDist);
                }
                else if (edgeStyle == CellEdgeStyle.Octogon) {
                    path = new paper.Path.RegularPolygon(pointCenter, 8, halfDist);
                }

                if (path !== null) {
                    path.rotate(Math.random() * 360, pointCenter);
                    path.scale(propertyCellScale(), propertyCellScale(), pointCenter);
                    path.strokeColor = 'black';
                    if (!cellSelected) {
                        path.fillColor = cellColor;
                    } else {
                        path.fullySelected = true;
                    }
                }
            }
        }

        return path;
    }
    
    function draw() {
        // Repopulating with new paths
        paper.project.activeLayer.removeChildren();
    
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Create border path
        if (propertyShowPageBorder()) {
            var pathBounds = new paper.Path.Rectangle(
                new paper.Point(0,0),
                new paper.Point(cms2pixels(propertyPageWidth()), cms2pixels(propertyPageHeight())));
            pathBounds.strokeColor = 'darkgray';
        }
                
        // Create profile path
        var profile = propertyProfile();
        if (profile.length > 0) {
            //var width = cms2pixels(_profileBounds.xmax - _profileBounds.xmin);
            var height = cms2pixels(_profileBounds.ymax - _profileBounds.ymin);

            // NOTE: Assumes the profile paths are sorted clockwise or counterclockwise
            _profilePath = new paper.Path();
            _profilePath.strokeColor = 'blue';
            _profilePath.closed = false;    // REVIEW:

            var pxLast = null;
            var pyLast = null;

            for (var iPath = 0; iPath < profile.length; ++iPath) {
                var profPath = profile[iPath];
                for (var iPt = 0; iPt < profPath.length; ++iPt) {
                    var px = cms2pixels(Number(profPath[iPt].x)) - cms2pixels(_profileBounds.xmin);
                    var py = height - (cms2pixels(Number(profPath[iPt].y)) - cms2pixels(_profileBounds.ymin));   // Flip because Paper Y+ downward
                    if (pxLast == null) {
                        pxLast = px;
                        pyLast = py;
                        _profilePath.add(new paper.Point(px, py));
                    }
                    else if (px != pxLast || py != pyLast) {
                        _profilePath.add(new paper.Point(px, py));
                        pxLast = px;
                        pyLast = py;
                    }
                }
            }
        }
        else {
            _profilePath = null;
        }

        if (_delaunay == null || _voronoi == null) {
            console.log("Delaunay or Voronoi is NULL");
            return;
        }

        // Will we need to clip voronoi cells outside and/or intersect profile?
        var clipCellsOutside = propertyClipCellsOutside() && (_profilePath != null);
        var clipCellsIntersect = propertyClipCellsIntersect() && (_profilePath != null);

        for (var i = 0, l = cellSitesCount(); i < l; i++) {

            var newPath = createVoronoiPath(i);

            // Need to clip cell?
            var removeCell = false;

            if (clipCellsOutside) {
                // If cell is outside profile then toss.
                removeCell |= (!_profilePath.intersects(newPath) && !_profilePath.contains(newPath.position));
            }

            if (newPath != null && clipCellsIntersect) {
                // If cell intersects profile then toss.
                removeCell |= _profilePath.intersects(newPath);
            }

            if (removeCell) {
                newPath.remove();
                newPath = null;
            }
            else {
                // TEST: Show center point of cell
                /*
                var [xCenter, yCenter] = cellSiteAt(i);
                var pathCenter = new paper.Path.Circle(new paper.Point(xCenter, yCenter), 5);
                pathCenter.strokeColor = 'red';
                */
            }
        }
    }

    /////////////////////////////////////////////////////////////////////////

    function generateSVG(isYUp = false) {
        // First reset to default scaling
        var prevScale = propertyViewScale();
        unscaleView();

        if (isYUp) {
            // HACK: Paper is Y+ downward and Fusion Y+ upward
            // Flip the diagram before we generate SVG

            var tyPrev = paper.view.matrix.ty;
            paper.view.matrix.ty = -1 * cms2pixels(propertyPageHeight());
        }

        // Hide profile
        if (_profilePath != null) {
            _profilePath.remove();
        }

        // Get the SVG
        var svg = paper.project.exportSVG({asString:true});

        // Restore profile
        if (_profilePath != null) {
            paper.project.activeLayer.addChild(_profilePath);
        }

        // Restore scale
        paper.view.matrix.ty = tyPrev;
        scaleView(prevScale);

        return svg;
    }

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

        console.log("Canvas size = " + canvas.width + " x " + canvas.height );

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

    // Create an empty project and a view for the canvas.  And do it
    // after we've set the canvas size.
    paper.setup(canvas);

    var _updateView = false;    // True if draw() should be called

    function updateView() {
        _updateView = true;
    }

    paper.view.onFrame = function(event) {
        if (_updateView){
            _updateView = false;

            draw();     // Note, draw may trigger another update view

            // Get relaxation count and adjust cell cites/centers
            if (lloydsCounter() > 0) {
                setLloydsCounter(lloydsCounter()-1);

                // Move the cell sites towards their cell centroids
                for (var i = 0, l = cellSitesCount(); i < l; i++) {
                    var cell = _voronoi.cellPolygon(i);
                    if (cell == null) continue;

                    const [x0,y0] = cellSiteAt(i);
                    const [x1, y1] = d3.polygonCentroid(cell);

                    var xNew = x0 + (x1 - x0) * LLOYDS_OMEGA;
                    var yNew = y0 + (y1 - y0) * LLOYDS_OMEGA;

                    setCellSiteAt(i, xNew, yNew);
                }

                _voronoi.update();
                generateVoronoi();
                
                _updateView = true;
            }
        }
    }

    // Reset for a new diagram.  Callers must call updateView() afterwards.
    function reset() {
        setPropertyUnits(UNITS.Centimeters);
        setPropertyPageWidth(DEFAULT_PAGE_WIDTH_METRIC);
        setPropertyPageHeight(DEFAULT_PAGE_HEIGHT_METRIC);
        setPropertyProfile([]);
        resizeCanvas();
    }

    function forceUpdate() {
        resizeCanvas();
        generateCells(true);
        updateView();
    }

    // resize the canvas to match browser window
    window.addEventListener('resize', resizeHandler, false);

    function resizeHandler() {
        resizeCanvas();
        updateView();
    }

    forceUpdate();   // Update and draw the diagram

    // Queue up event to tell Fusion we are alive
    setTimeout(sendEventStartedToFusion, 500);

    // TEST:
    //handleActionStarted(TEST_INIT_FROM_FUSION);

    /////////////////////////////////////////////////////////////////////////
    // Fusion 360 Add-In Support Section

    function handleActionStarted(jsonStr) {
        var jsonData = JSON.parse(jsonStr);
        if (jsonData) {
            // Reset to defaults
            reset();

            if (typeof jsonData.units !== 'undefined') {
                setPropertyUnits(jsonData.units);
            }

            if (typeof jsonData.width !== 'undefined') {
                setPropertyPageWidth(jsonData.width);       // centimeters
            }

            if (typeof jsonData.height !== 'undefined') {
                setPropertyPageHeight(jsonData.height);     // centimeters
            }

            if (typeof jsonData.profile !== 'undefined') {
                setPropertyProfile(jsonData.profile);
            }

            // Now update the diagram
            forceUpdate(); 
        }
        else {
            console.log("Failed to parse json: " + jsonStr);
        }
    }

    // Used to check if running in Fusion 360.  It akes a moment for 'adsk' namespace
    // to be injected by Fusion.
    var _fusionStartCounter = 4;

    function sendEventStartedToFusion() {

        if (typeof adsk === 'undefined') {
            if (_fusionStartCounter > 0) {
                _fusionStartCounter--;
                setTimeout(sendEventStartedToFusion, 250);  // Let's try again
            }
            return;
        }

        $("#publishToFusionBtn").show();    // Show the publish button

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

        var svg = generateSVG(true);    // Generate with Y+ upward (Fusion)

        if (svg === null || svg === '') {
            // TODO: Display error to user.
            console.log("No SVG generated.");
            return;
        }

        var svgString = encodeURIComponent(svg);

        // Package up data as JSON
        var jsonDataStr = `{
            "action": "publish",
            "arguments": {
                "svg" : "${svgString}"
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