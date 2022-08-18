#Author-Hans Kellner
#Description-This is an Autodesk Fusion 360 addin that's used for generating Voronoi patterns.
#Copyright (C) 2015-2020 Hans Kellner: https://github.com/hanskellner/Fusion360Voronoi
#MIT License: See https://github.com/hanskellner/Fusion360Voronoi/LICENSE.md

import adsk.core, adsk.fusion, adsk.cam, traceback
import json, tempfile, platform
from urllib.parse import unquote

#############################################################################
# global constants

_PALETTE_ID = 'VoronoiPalette'
_PALETTE_TITLE = 'Voronoi Sketch Generator'
_PALETTE_HTML_FILENAME = 'Voronoi.html'
_PALETTE_OK_BUTTON_TEXT = 'Voronoi Editor'

_SOLID_CREATE_PANEL_ID = 'SolidCreatePanel'
_CREATE_VORONOI_CMD_ID = 'createVoronoiCmdId'
_CREATE_VORONOI_CORE_CMD_ID = 'createVoronoiCoreCmdId'

_VALUE_INPUT_ID_WIDTH = 'widthValueInputId'
_VALUE_INPUT_ID_HEIGHT = 'heightValueInputId'

_VALUE_INPUT_ID_WIDTH_PROFILE = 'widthProfileValueInputId'
_VALUE_INPUT_ID_HEIGHT_PROFILE = 'heightProfileValueInputId'
_BOOL_INPUT_ID_APPLY_PROFILE_SIZE = 'applyProfileSizeBoolValueInputId'

_SELECTION_INPUT_ID_TARGET = 'targetSelectionInputId'
_DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE = 'constructionPlaneDropDownInputId'

_CONSTRUCTION_PLANE_XY = "XY Plane"
_CONSTRUCTION_PLANE_XZ = "XZ Plane"
_CONSTRUCTION_PLANE_YZ = "YZ Plane"

#############################################################################
# Global variables

# event handlers to keep them referenced for the duration of the command
_app = adsk.core.Application.cast(None)
_ui = adsk.core.UserInterface.cast(None)

_handlers = []  # event handlers

# Which construction plane to place sketch when a sketch isn't specified
_constructionPlane = _CONSTRUCTION_PLANE_XY

_units = 'cm'   # user specified units

_widthVoronoi = 0      # dimensions to use for voronoi.  Should be in centimeters.
_heightVoronoi = 0

_selectedSketchName = ''

# Set to the points that roughly define the selected profile
_profilePoints = []
_profileSketchName = ''
_profileBoundsMin = None
_profileBoundsMax = None

_svgFilePath = ''

# Command Inputs
_targetSelectionInput = adsk.core.SelectionCommandInput.cast(None)
_constructionPlaneDropDownInput = adsk.core.DropDownCommandInput.cast(None)
_widthValueCommandInput = adsk.core.ValueCommandInput.cast(None)
_heightValueCommandInput = adsk.core.ValueCommandInput.cast(None)
_widthProfileStringValueCommandInput = adsk.core.StringValueCommandInput.cast(None)
_heightProfileStringValueCommandInput = adsk.core.StringValueCommandInput.cast(None)
_applyProfileSizeBoolValueInput = adsk.core.BoolValueCommandInput.cast(None)

#############################################################################

# Reset some of the variables before dialog appears
def resetState():
    global _profilePoints, _profileSketchName, _profileBoundsMin, _profileBoundsMax, _selectedSketchName, _svgFilePath
    _profilePoints = []
    _profileSketchName = ''
    _profileBoundsMin = None
    _profileBoundsMax = None
    _selectedSketchName = ''
    _svgFilePath = ''

# Get the selected sketch name; otherwise an empty string
def getSelectedSketchName():
    # Get the selected sketch
    if _targetSelectionInput.selectionCount == 1:
        theSelection = _targetSelectionInput.selection(0)

        if theSelection.entity.objectType == adsk.fusion.Sketch.classType():
            return theSelection.entity.name
            
    # Nothing selected or a profile selected so no sketch name
    return ''

# Returns an array of arrays containing the points for each curve in the profile.
# The curves are ordered so endpoints are equal.
def getProfilePoints(profile):

    outerLoop = None

    # Find the outer loop
    for iLoop in range(profile.profileLoops.count):
        if profile.profileLoops.item(iLoop).isOuter:
            outerLoop = profile.profileLoops.item(iLoop)
            break

    if outerLoop == None:
        return None

    profileCurves = []  # Will contain an array for each curve

    curves = outerLoop.profileCurves
    for iCurve in range(curves.count):
        profileCurves.append([])

        curve = curves.item(iCurve)
        isLine = curve.geometryType == adsk.core.Curve3DTypes.Line3DCurveType

        if isLine:
            line = adsk.core.Line3D.cast(curve.geometry)
            profileCurves[iCurve].append(line.startPoint)
            profileCurves[iCurve].append(line.endPoint)
        else:
            evaluator = curve.geometry.evaluator
            (retVal, startParam, endParam) = evaluator.getParameterExtents()
            (retVal, length) = evaluator.getLengthAtParameter(startParam, endParam)

            num_steps = length / 0.2   # step every 2mm
            step = (endParam - startParam)/num_steps

            param = startParam
            while param < endParam:
                (result, pt) = evaluator.getPointAtParameter(param)
                profileCurves[iCurve].append(pt)
                param += step

            if param > endParam:
                (retVal, startPoint, endPoint) = evaluator.getEndPoints()
                profileCurves[iCurve].append(endPoint)

    # ARGH: The curves returned above are not sorted.  Need to sort them.
    if len(profileCurves) <= 1:
        return profileCurves

    lastCurve = None
    sortedProfileCurves = []

    # Extract each profile curve as it gets added to sorted list
    while len(profileCurves) > 0:
        if lastCurve == None:
            lastCurve = profileCurves[0]
            sortedProfileCurves.append(lastCurve)
            profileCurves.pop(0)
        else:
            # Look for the next path that connects with the last path
            foundMatch = False

            for iCurve in range(len(profileCurves)):
                curve = profileCurves[iCurve]
                lastEndPoint = lastCurve[len(lastCurve)-1]

                # Does this path begin with the end point of last path?
                if lastEndPoint.isEqualTo(curve[0]):
                    sortedProfileCurves.append(curve)
                    lastCurve = curve
                    profileCurves.pop(iCurve)
                    foundMatch = True
                    break   # Drop out of for loop
                
                elif lastEndPoint.isEqualTo(curve[len(curve)-1]):
                    # Argh - Need to reverse this curves point order
                    curveReversed = []
                    for iPt in range(len(curve)-1, -1, -1):
                        curveReversed.append(curve[iPt])
                    lastCurve = curveReversed
                    sortedProfileCurves.append(lastCurve)
                    profileCurves.pop(iCurve)
                    foundMatch = True
                    break   # Drop out of for loop

            # If not match found then we need to exit search but first copy over path as-is
            if foundMatch == False:
                print("Unable to sort profile paths")
                for iCurve in range(len(profileCurves)):
                    sortedProfileCurves.append(profileCurves[iCurve])
                profileCurves = [] # This will drop out of while loop
    
    return sortedProfileCurves


def getProfileBounds(profile):

    outerLoop = None

    # Find the outer loop
    for iLoop in range(profile.profileLoops.count):
        if profile.profileLoops.item(iLoop).isOuter:
            outerLoop = profile.profileLoops.item(iLoop)
            break

    if outerLoop == None:
        return None

    # Get the combined bbox for the outer loop's curves
    bbox = None
    for iCurve in range(outerLoop.profileCurves.count):
        curve = outerLoop.profileCurves.item(iCurve)
        if bbox == None:
            bbox = curve.boundingBox.copy()
        else:
            bbox.combine(curve.boundingBox)

    return bbox


# Get the selected profile; otherwise None
def getSelectedProfile():
    profile = None
    bbox = None
    name = ''

    if _targetSelectionInput.selectionCount == 1:
        theSelection = _targetSelectionInput.selection(0)

        # REVIEW: Do we need to test for all Profile subclasses?
        if theSelection.entity.objectType == adsk.fusion.Profile.classType():
            profile = theSelection.entity
            bbox = getProfileBounds(profile)
            name = profile.parentSketch.name

            #print("Profile bounds: {0},{1},{2} - {3},{4},{5}".format(bbox.minPoint.x,bbox.minPoint.y,bbox.minPoint.z,bbox.maxPoint.x,bbox.maxPoint.y,bbox.maxPoint.z))

    # Nothing selected or a Sketch selected
    return profile, bbox, name


# HACK: the insert from SVG fixes the curves.  Use this to unfix so that
# they move when their associated points are moved.
def setFixedSketchPoints(aSketch, flag):
    try:
        # NOTE: throws an exception
        #for curve in aSketch.sketchCurves:
        #    curve.isFixed = False
        for iCurve in range(aSketch.sketchCurves.count):
            curve = aSketch.sketchCurves.item(iCurve)
            curve.isFixed = flag
    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# NOTE: This is a very computation expensive operation.  It can take several
# minutes to perform depending on the complexity of the sketch.
def moveSketch(aSketch, dx, dy, dz):
    try:

        coll = adsk.core.ObjectCollection.create()

        for iCrv in range(aSketch.sketchCurves.count):
            coll.add(aSketch.sketchCurves.item(iCrv))

        for iPt in range(aSketch.sketchPoints.count):
            coll.add(aSketch.sketchPoints.item(iPt))

        # See for Matrix3D help
        # https://forums.autodesk.com/t5/fusion-360-api-and-scripts/interpreting-matrix3d-data/td-p/6069180
        transform = adsk.core.Matrix3D.create()
        transform.translation = adsk.core.Vector3D.create(dx, dy, dz)
        resMove = aSketch.move(coll, transform)

        if not resMove:
            print("Failed to mve sketch elements!")

    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Send information to the palette. This will trigger an event in the javascript
# within the html so that it can be handled.
# Note that all values are in centimeters (default units)
def sendInitInfoToHTML(palette):

    global _units, _widthVoronoi, _heightVoronoi, _profilePoints

    #des = adsk.fusion.Design.cast(_app.activeProduct)

    jsonDataStr = '{{"units": "{0}", "width": "{1}", "height": "{2}", "profile": ['.format(_units, _widthVoronoi, _heightVoronoi)

    # If profile selected and there are profile points then add to json
    for iPath in range(len(_profilePoints)):
        if iPath > 0:
            jsonDataStr += ', '
        jsonDataStr += '['

        pathPoints = _profilePoints[iPath]
        for iPt in range(len(pathPoints)):
            if iPt > 0:
                jsonDataStr += ', '

            x = pathPoints[iPt].x # des.unitsManager.convert(pathPoints[iPt].x, 'cm', _units)
            y = pathPoints[iPt].y # des.unitsManager.convert(pathPoints[iPt].y, 'cm', _units)
            
            jsonDataStr += '{{"x":"{0:.4}","y":"{1:.4}"}}'.format(x,y)

        jsonDataStr += ']'

    jsonDataStr += ']}'
    print(jsonDataStr)

    palette.sendInfoToHTML('init', jsonDataStr)


#############################################################################

# Event handler for the inputChanged event.
class VoronoiCommandInputChangedHandler(adsk.core.InputChangedEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            global _app, _units, _widthVoronoi, _heightVoronoi
            global _profileBoundsMin, _profileBoundsMax, _profilePoints, _selectedSketchName, _profileSketchName, _constructionPlane
            global _widthValueCommandInput, _heightValueCommandInput, _widthProfileStringValueCommandInput, _heightProfileStringValueCommandInput

            des = adsk.fusion.Design.cast(_app.activeProduct)

            eventArgs = adsk.core.InputChangedEventArgs.cast(args)
            changedInput = eventArgs.input

            if changedInput.id == _SELECTION_INPUT_ID_TARGET:
                # Either a sketch, a profile, or none selected...
                _selectedSketchName = getSelectedSketchName()
                ( profile, bboxProfile, profileSketchName) = getSelectedProfile()

                _constructionPlaneDropDownInput.isEnabled = (profile == None and _selectedSketchName == '')

                # If a profile selected, then get dimensions and set in inputs
                if profile != None:
                    # Get profile width/height (in centimeters)
                    widthProfile = bboxProfile.maxPoint.x - bboxProfile.minPoint.x
                    heightProfile = bboxProfile.maxPoint.y - bboxProfile.minPoint.y

                    # Set the profile width and height input values
                    _widthProfileStringValueCommandInput.value = '{0:.2f} '.format(des.unitsManager.convert(widthProfile, 'cm', _units)) + _units
                    _heightProfileStringValueCommandInput.value = '{0:.2f} '.format(des.unitsManager.convert(heightProfile, 'cm', _units)) + _units

                    _profilePoints = getProfilePoints(profile)
                    _profileSketchName = profileSketchName
                    _profileBoundsMin = bboxProfile.minPoint
                    _profileBoundsMax = bboxProfile.maxPoint
                else:
                    _widthProfileStringValueCommandInput.value = "0.0"
                    _heightProfileStringValueCommandInput.value = "0.0"
                    _profilePoints = []

                _widthProfileStringValueCommandInput.isVisible = (profile != None)
                _heightProfileStringValueCommandInput.isVisible = (profile != None)
                _applyProfileSizeBoolValueInput.isVisible = (profile != None)

            elif changedInput.id == _DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE:
                _constructionPlane = _constructionPlaneDropDownInput.selectedItem.name

            elif changedInput.id == _BOOL_INPUT_ID_APPLY_PROFILE_SIZE:
                # Copy profile size over to voronoi size (should only be possible if profile selected)
                ( profile, bboxProfile, profileSketchName) = getSelectedProfile()
                if profile != None:
                    _widthValueCommandInput.value = bboxProfile.maxPoint.x - bboxProfile.minPoint.x
                    _heightValueCommandInput.value = bboxProfile.maxPoint.y - bboxProfile.minPoint.y
                else:
                    _widthValueCommandInput.value = 0
                    _heightValueCommandInput.value = 0

            # Make sure to save these for later as they might have changed
            if _widthValueCommandInput.isValidExpression:
                _widthVoronoi = _widthValueCommandInput.value
            if _heightValueCommandInput.isValidExpression:
                _heightVoronoi = _heightValueCommandInput.value

        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
        

# Define the event handler for when the command is activated.
class VoronoiCommandActivatedHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            resetState()

            global _widthProfileStringValueCommandInput, _heightProfileStringValueCommandInput, _applyProfileSizeBoolValueInput
            _widthProfileStringValueCommandInput.isVisible = False
            _heightProfileStringValueCommandInput.isVisible = False
            _applyProfileSizeBoolValueInput.isVisible = False

        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the commandExecuted event.
class VoronoiCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            # Create and display the palette.
            palette = _ui.palettes.itemById(_PALETTE_ID)
            if not palette:
                palette = _ui.palettes.add(_PALETTE_ID, _PALETTE_TITLE, _PALETTE_HTML_FILENAME, True, True, True, 1120, 640, True)

                # Float the palette.
                palette.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateFloating

                # HACK: Disallow docking for now since this causes the palette to be lost
                palette.dockingOption = adsk.core.PaletteDockingOptions.PaletteDockOptionsNone
    
                # Add handler to HTMLEvent of the palette.
                onHTMLEvent = MyHTMLEventHandler()
                palette.incomingFromHTML.add(onHTMLEvent)
                _handlers.append(onHTMLEvent)
    
                # Add handler to CloseEvent of the palette.
                onClosed = PaletteCloseEventHandler()
                palette.closed.add(onClosed)
                _handlers.append(onClosed)

                # HACK: On creation, the html in the palette will callback to get the setup information
                # Normally we would send it with sendInfoToHTML.  But that doesn't work on create.
                # It does work on subsequent calls, therefore it's below.

            else:
                palette.isVisible = True

                # HACK: We are doing this here and not in create above since the msg never is
                # received by the browser that first time.  Handled in a html callback.
                sendInitInfoToHTML(palette)

        except:
            if _ui:
                _ui.messageBox('Command executed failed: {}'.format(traceback.format_exc()))


# Event handler for the commandCreated event.
class VoronoiCommandCreatedHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()              
    def notify(self, args):
        try:
            # Verify that a Fusion design is active.
            des = adsk.fusion.Design.cast(_app.activeProduct)
            if not des:
                _ui.messageBox('A Fusion design must be active when invoking this command.')
                return

            # Determine units
            global _units
            _units = des.unitsManager.defaultLengthUnits

            # No profile
            _profileSketchName = ''

            # Setup the command
            cmd = args.command
            cmd.isExecutedWhenPreEmpted = False     # cancel cmd if another is run
            #cmd.helpFile = 'help.html'

            global _targetSelectionInput, _constructionPlaneDropDownInput, _widthValueCommandInput, _heightValueCommandInput
            global _widthProfileStringValueCommandInput, _heightProfileStringValueCommandInput, _applyProfileSizeBoolValueInput

            # Define the inputs.
            cmdInputs_ = cmd.commandInputs

            _targetSelectionInput = cmdInputs_.addSelectionInput(_SELECTION_INPUT_ID_TARGET, 'Sketch or Profile', 'Select a sketch or profile to place the Voronoi')
            _targetSelectionInput.addSelectionFilter('Sketches')
            _targetSelectionInput.addSelectionFilter('Profiles')
            _targetSelectionInput.setSelectionLimits(0,1)

            _constructionPlaneDropDownInput = cmdInputs_.addDropDownCommandInput(_DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE, 'Construction Plane', adsk.core.DropDownStyles.TextListDropDownStyle)
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_XY, (_constructionPlane == _CONSTRUCTION_PLANE_XY))
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_XZ, (_constructionPlane == _CONSTRUCTION_PLANE_XZ))
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_YZ, (_constructionPlane == _CONSTRUCTION_PLANE_YZ))

            # Create a default values using a string
            value_width = adsk.core.ValueInput.createByString('6.0 in')
            value_height = adsk.core.ValueInput.createByString('4.0 in')

            if _units != 'in' and _units != 'ft':
                value_width = adsk.core.ValueInput.createByString('15.0 cm')
                value_height = adsk.core.ValueInput.createByString('10.0 cm')

            _widthValueCommandInput = cmdInputs_.addValueInput(_VALUE_INPUT_ID_WIDTH, 'Width', _units, value_width) # adsk.core.ValueInput.createByReal(25.0))
            _heightValueCommandInput = cmdInputs_.addValueInput(_VALUE_INPUT_ID_HEIGHT, 'Height', _units, value_height) # adsk.core.ValueInput.createByReal(20.0))

            global _widthVoronoi, _heightVoronoi
            _widthVoronoi = _widthValueCommandInput.value
            _heightVoronoi = _heightValueCommandInput.value

            _widthProfileStringValueCommandInput = cmdInputs_.addStringValueInput(_VALUE_INPUT_ID_WIDTH_PROFILE, 'Profile Width')
            _widthProfileStringValueCommandInput.isReadOnly = True
            _widthProfileStringValueCommandInput.isVisible = False

            _heightProfileStringValueCommandInput = cmdInputs_.addStringValueInput(_VALUE_INPUT_ID_HEIGHT_PROFILE, 'Profile Height')
            _heightProfileStringValueCommandInput.isReadOnly = True
            _heightProfileStringValueCommandInput.isVisible = False

            _applyProfileSizeBoolValueInput = cmdInputs_.addBoolValueInput(_BOOL_INPUT_ID_APPLY_PROFILE_SIZE, 'Use Profile Size', False, './/resources//CopyProfileSize')
            _applyProfileSizeBoolValueInput.isVisible = False

            # Change the OK button text to indicate we will show the voronoi editor palette
            cmd.okButtonText = _PALETTE_OK_BUTTON_TEXT

            # Setup event handlers
            onExecute = VoronoiCommandExecuteHandler()
            cmd.execute.add(onExecute)
            _handlers.append(onExecute)
            
            onInputChanged = VoronoiCommandInputChangedHandler()
            cmd.inputChanged.add(onInputChanged)
            _handlers.append(onInputChanged)

            onActivate = VoronoiCommandActivatedHandler()
            cmd.activate.add(onActivate)
            _handlers.append(onActivate)
        except:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the palette close event.
class PaletteCloseEventHandler(adsk.core.UserInterfaceGeneralEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            #_ui.messageBox('Close button was clicked.')
            pass
        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the palette HTML event.
class MyHTMLEventHandler(adsk.core.HTMLEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            global _svgFilePath

            htmlArgs = adsk.core.HTMLEventArgs.cast(args)            
            data = json.loads(htmlArgs.data)

            # This handler can receive the return value from the JS fusionJavaScriptHandler() call.
            # If the action value isn't present then ignore this call.
            if data == '' or not 'action' in data:
                return
            
            theAction = data['action']
            theArgs = data['arguments']

            # Sent when the palette has been loaded and initialized
            if theAction == 'started':

                # Return information to the palette. This can then be handled by the palette JS code
                # NOTE: This isn't working.  On the JS side the value is a Promise object???
                #htmlArgs.returnData = '{{"sketchName": "{0}","units": "{1}"}}'.format(selectedSketchName, _units)

                # HACK: We are doing this here and not in create above since the msg never is
                # received by the browser that first time.
                # Send information to the palette. This will trigger an event in the javascript
                # within the html so that it can be handled.

                palette = _ui.palettes.itemById(_PALETTE_ID)
                if palette:
                    sendInitInfoToHTML(palette)

            # Sent when the palette should be closed
            elif theAction == 'close':
                palette = _ui.palettes.itemById(_PALETTE_ID)
                if palette:
                    palette.isVisible = False

            # Sent when the voronoi should be published/added to a sketch
            elif theAction == 'publish':
                
                palette = _ui.palettes.itemById(_PALETTE_ID)
                if palette:
                    palette.isVisible = False

                    svgStr = unquote(theArgs['svg'])

                    # Save the SVG to a temp file            
                    fp = tempfile.NamedTemporaryFile(mode='w', suffix='.svg', delete=False)
                    fp.writelines(svgStr)
                    fp.close()
                    _svgFilePath = fp.name
                    print ("Generated temporary SVG file: " + _svgFilePath)

                    # Get the command definition for the create voronoi core command which
                    # will do the work.
                    createVoronoiCoreCmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CORE_CMD_ID)
                    if createVoronoiCoreCmdDef != None:
                        namedValues = adsk.core.NamedValues.create()
                        namedValues.add('svgFilePath', adsk.core.ValueInput.createByString(_svgFilePath))
                        createVoronoiCoreCmdDef.execute(namedValues)
                    else:
                        pass    # error!
        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the commandCreated event.
class CreateVoronoiCommandCreatedEventHandler(adsk.core.CommandCreatedEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        eventArgs = adsk.core.CommandCreatedEventArgs.cast(args)
        cmd = eventArgs.command

        # Connect to the execute event.
        onExecute = CreateVoronoiCommandExecuteHandler()
        cmd.execute.add(onExecute)
        _handlers.append(onExecute)


# Event handler for the execute event.
class CreateVoronoiCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        eventArgs = adsk.core.CommandEventArgs.cast(args)

        global _app, _svgFilePath, _selectedSketchName, _constructionPlane
        global _profileBoundsMin, _profileBoundsMax, _profileSketchName

        if _svgFilePath == '':
            print("ERROR: Missing the SVG filepath")
            return ()

        # Get the specified sketch or create one if none found
        design = _app.activeProduct
        rootComp = design.rootComponent

        theSketch = None
        
        if _selectedSketchName != '':
            theSketch = rootComp.sketches.itemByName(_selectedSketchName)
        elif _profileSketchName != '':
            theSketch = rootComp.sketches.itemByName(_profileSketchName)
        
        if theSketch == None:
            # Which plane if no sketch?
            # xYConstructionPlane, xZConstructionPlane, yZConstructionPlane
            plane = rootComp.xYConstructionPlane
            if _constructionPlane == _CONSTRUCTION_PLANE_XZ:
                plane = rootComp.xZConstructionPlane
            elif _constructionPlane == _CONSTRUCTION_PLANE_YZ:
                plane = rootComp.yZConstructionPlane

            theSketch = rootComp.sketches.add(plane)
            theSketch.name = "Voronoi - " + theSketch.name

        theSketch.isComputeDeferred = True  # Help to speed up import

        # DEFECT: API call below is not honoring the xpos, ypos values.
        # DEFECT: API call is not positioning and orienting the SVG the same as UI Insert SVG file does.
        #xDirSketch = theSketch.xDirection   # Vector3D
        #yDirSketch = theSketch.yDirection
        #print("Sketch X Dir = {0},{1},{2}".format(xDirSketch.x,xDirSketch.y,xDirSketch.z))
        #print("Sketch Y Dir = {0},{1},{2}".format(yDirSketch.x,yDirSketch.y,yDirSketch.z))

        dxSketchPos = 0
        dySketchPos = 0

        # If profile selected, need to shift to match lower left corner of profile.  See moveSketch() below.
        if _profileSketchName != '' and _profileBoundsMin != None:
            dxSketchPos = _profileBoundsMin.x
            dySketchPos = (_profileBoundsMax.y - _profileBoundsMin.y) + _profileBoundsMin.y

        # import the temp svg file into the sketch.
        retValueImport = theSketch.importSVG(_svgFilePath, 0, 0, 1) # (filePath, xPos, yPos, scale)

        # HACK: the insert from SVG fixes the curves.  Unfix so that
        # they move when their associated points are moved.
        setFixedSketchPoints(theSketch, False)

        # HACK: The importSVG() call is not honoring the yPos param.  Manually shift
        # the sketch here so it's in the correct location.
        # NOTE: See performance issue with moveSketch()
        moveSketch(theSketch, dxSketchPos, dySketchPos, 0)

        theSketch.isComputeDeferred = False

        if not retValueImport:
            print ("Failed to import generated temporary SVG file: " + _svgFilePath)
 
def run(context):
    try:
        global _ui, _app
        _app = adsk.core.Application.get()
        _ui  = _app.userInterface

        # Add a command that displays the panel.
        createVoronoiCmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CMD_ID)
        if not createVoronoiCmdDef:
            createVoronoiCmdDef = _ui.commandDefinitions.addButtonDefinition(_CREATE_VORONOI_CMD_ID, 'Voronoi Sketch Generator', 'Generates a voronoi sketch\n', './/resources')
            createVoronoiCmdDef.toolClipFilename = './/resources//voronoi-tooltip.png'
            
            # Connect to Command Created event.
            onCommandCreated = VoronoiCommandCreatedHandler()
            createVoronoiCmdDef.commandCreated.add(onCommandCreated)
            _handlers.append(onCommandCreated)
        
        # Add a command that will create the Voronoi.
        createVoronoiCoreCmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CORE_CMD_ID)
        if not createVoronoiCoreCmdDef:
            createVoronoiCoreCmdDef = _ui.commandDefinitions.addButtonDefinition(_CREATE_VORONOI_CORE_CMD_ID, 'Create Voronoi', 'Creates the voronoi sketch\n', './/resources')
            
            # Connect to Command Created event.
            onCommandCreated = CreateVoronoiCommandCreatedEventHandler()
            createVoronoiCoreCmdDef.commandCreated.add(onCommandCreated)
            _handlers.append(onCommandCreated)
        
        # Get the CREATE panel in the MODEL workspace. 
        createPanel = _ui.allToolbarPanels.itemById(_SOLID_CREATE_PANEL_ID)

        # Add button to the panel
        btnControl = createPanel.controls.itemById(_CREATE_VORONOI_CMD_ID)
        if not btnControl:
            btnControl = createPanel.controls.addCommand(createVoronoiCmdDef)

            # Make the button available in the panel.
            btnControl.isPromotedByDefault = True
            btnControl.isPromoted = True
        
        if context['IsApplicationStartup'] is False:
            _ui.messageBox('The "Voronoi Sketch Generator" command has been added\nto the SOLID->CREATE panel dropdown of the DESIGN workspace.\n\nTo run the command, select the SOLID->CREATE dropdown\nthen select "Voronoi Sketch Generator".')
    except:
        #pass
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def stop(context):
    try:
        # Delete the palette created by this add-in.
        palette = _ui.palettes.itemById(_PALETTE_ID)
        if palette:
            palette.deleteMe()
            
        # Delete controls and associated command definitions created by this add-ins
        createPanel = _ui.allToolbarPanels.itemById(_SOLID_CREATE_PANEL_ID)
        
        btnControl = createPanel.controls.itemById(_CREATE_VORONOI_CMD_ID)
        if btnControl:
            btnControl.deleteMe()
        
        cmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CMD_ID)
        if cmdDef:
            cmdDef.deleteMe() 
        
        cmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CORE_CMD_ID)
        if cmdDef:
            cmdDef.deleteMe()
    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))