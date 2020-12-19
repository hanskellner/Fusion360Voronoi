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

_DROPDOWN_INPUT_ID_STANDARD = 'standardDropDownInputId'
_SELECTION_INPUT_ID_SKETCH = 'sketchSelectionInputId'
_DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE = 'constructionPlaneDropDownInputId'

_ATTRIBUTE_GROUP_NAME = 'Voronoi'
_ATTRIBUTE_NAME_STANDARD = 'standard'

_SYSTEM_ENGLISH = 'English'
_SYSTEM_METRIC = 'Metric'

_SYSTEM_ENGLISH_UNIT = 'in'
_SYSTEM_METRIC_UNIT = 'cm'

# Displayed in UI control
_SYSTEM_ENGLISH_ITEM_NAME = 'English (Inches)'
_SYSTEM_METRIC_ITEM_NAME = 'Metric (Centimeters)'

_CONSTRUCTION_PLANE_XY = "XY Plane"
_CONSTRUCTION_PLANE_XZ = "XZ Plane"
_CONSTRUCTION_PLANE_YZ = "YZ Plane"

#############################################################################
# Global variables

# event handlers to keep them referenced for the duration of the command
_app = adsk.core.Application.cast(None)
_ui = adsk.core.UserInterface.cast(None)

_handlers = []  # event handlers

_standardSystem = _SYSTEM_ENGLISH
_units = _SYSTEM_ENGLISH_UNIT

_selectedSketchName = ''

# Which construction plane to place sketch when a sketch isn't specified
_constructionPlane = _CONSTRUCTION_PLANE_XY

_standardDropDownInput = adsk.core.DropDownCommandInput.cast(None)
_sketchSelectionInput = adsk.core.SelectionCommandInput.cast(None)
_constructionPlaneDropDownInput = adsk.core.DropDownCommandInput.cast(None)


#############################################################################

# Get the selected sketch name; otherwise an empty string
def getSketchName():
    # Get the selected sketch
    if _sketchSelectionInput.selectionCount == 1:
        theSketch = _sketchSelectionInput.selection(0).entity
        return theSketch.name
    else:
        # A sketch wasn't selected so no name
        return ''


def moveSketch(aSketch, dx, dy, dz):
    try:

        # HACK: the insert from SVG fixes the curves.  Unfix so that
        # they move when their associated points are moved.
        # NOTE: throws an exception
        #for curve in aSketch.sketchCurves:
        #    curve.isFixed = False
        for iCurve in range(aSketch.sketchCurves.count):
            curve = aSketch.sketchCurves.item(iCurve)
            curve.isFixed = False

        points = adsk.core.ObjectCollection.create()
        # NOTE: throws an exception
        #for pnt in aSketch.sketchPoints:
        #    points.add(pnt)
        for iPt in range(aSketch.sketchPoints.count):
            points.add(aSketch.sketchPoints.item(iPt))

        # NOTE: Does this need to take into account the orientation of the sketch?
        #xDir = aSketch.xDirection
        #yDir = aSketch.yDirection
        
        #xDir.transformBy(aSketch.transform)
        #yDir.transformBy(aSketch.transform)
        
        #zDir = aSketch.xDirection.crossProduct(aSketch.yDirection)
        #zDir.transformBy(aSketch.transform)

        #origin = aSketch.origin
        #origin.transformBy(aSketch.transform)

        # See for Matrix3D help
        # https://forums.autodesk.com/t5/fusion-360-api-and-scripts/interpreting-matrix3d-data/td-p/6069180
        trans = adsk.core.Matrix3D.create()
        trans.setCell(0,3,float(dx))  # X
        trans.setCell(1,3,float(dy))  # Y
        trans.setCell(2,3,float(dz))  # Z
        aSketch.move(points, trans)
    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


#############################################################################

# Event handler for the inputChanged event.
class VoronoiCommandInputChangedHandler(adsk.core.InputChangedEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            eventArgs = adsk.core.InputChangedEventArgs.cast(args)
            changedInput = eventArgs.input
            
            global _units, _constructionPlane

            if changedInput.id == _DROPDOWN_INPUT_ID_STANDARD:
                if _standardDropDownInput.selectedItem.name == _SYSTEM_ENGLISH_ITEM_NAME:
                    _standardSystem = _SYSTEM_ENGLISH
                    _units = _SYSTEM_ENGLISH_UNIT
                elif _standardDropDownInput.selectedItem.name == _SYSTEM_METRIC_ITEM_NAME:
                    _standardSystem = _SYSTEM_METRIC
                    _units = _SYSTEM_METRIC_UNIT

                des = adsk.fusion.Design.cast(_app.activeProduct)
                if des:
                    standardAttrib = des.attributes.itemByName(_ATTRIBUTE_GROUP_NAME, _ATTRIBUTE_NAME_STANDARD)
                    if not standardAttrib:
                        des.attributes.add(_ATTRIBUTE_GROUP_NAME, _ATTRIBUTE_NAME_STANDARD, _standardSystem)
                    else:
                        standardAttrib.value = _standardSystem
            
            elif changedInput.id == _SELECTION_INPUT_ID_SKETCH:
                sketchName = getSketchName()
                _constructionPlaneDropDownInput.isEnabled = (sketchName == None or sketchName == '')

            elif changedInput.id == _DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE:
                _constructionPlane = _constructionPlaneDropDownInput.selectedItem.name

        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))
        

# Define the event handler for when the command is activated.
class VoronoiCommandActivatedHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            #standardDropDown = args.command.commandInputs.itemById(_DROPDOWN_INPUT_ID_STANDARD)
            #standardDropDown.isVisible = False
            pass
        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


# Event handler for the commandExecuted event.
class VoronoiCommandExecuteHandler(adsk.core.CommandEventHandler):
    def __init__(self):
        super().__init__()
    def notify(self, args):
        try:
            global _selectedSketchName, _units

            # Get the selected sketch name
            _selectedSketchName = getSketchName()

            # Create and display the palette.
            palette = _ui.palettes.itemById(_PALETTE_ID)
            if not palette:
                palette = _ui.palettes.add(_PALETTE_ID, _PALETTE_TITLE, _PALETTE_HTML_FILENAME, True, False, True, 1200, 720, True)

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

                # Send information to the palette. This will trigger an event in the javascript
                # within the html so that it can be handled.
                # HACK: We are doing this here and not in create above since the msg never is
                # received by the browser that first time.  Handled in a html callback.
                jsonDataStr = '{{"sketchName": "{0}","units": "{1}"}}'.format(_selectedSketchName, _units)
                palette.sendInfoToHTML('init', jsonDataStr)

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
                return()

            # Determine units
            defaultUnits = des.unitsManager.defaultLengthUnits
                
            # Determine whether to use inches or millimeters as the intial default.
            global _units
            if defaultUnits == 'in' or defaultUnits == 'ft':    # literals from Fusion
                _units = _SYSTEM_ENGLISH_UNIT
            else:
                _units = _SYSTEM_METRIC_UNIT
                        
            # Define the default values and get the previous values from the attributes.
            if _units == _SYSTEM_ENGLISH_UNIT:
                _standardSystem = _SYSTEM_ENGLISH
            else:
                _standardSystem = _SYSTEM_METRIC

            standardAttrib = des.attributes.itemByName(_ATTRIBUTE_GROUP_NAME, _ATTRIBUTE_NAME_STANDARD)
            if standardAttrib:
                _standardSystem = standardAttrib.value
                
            if _standardSystem == _SYSTEM_ENGLISH:
                _units = _SYSTEM_ENGLISH_UNIT
            else:
                _units = _SYSTEM_METRIC_UNIT

            # Setup the command
            cmd = args.command
            cmd.isExecutedWhenPreEmpted = False     # cancel cmd if another is run
            #cmd.helpFile = 'help.html'

            # Define the inputs.
            global _standardDropDownInput, _sketchSelectionInput, _constructionPlaneDropDownInput

            cmdInputs_ = cmd.commandInputs
            
            _standardDropDownInput = cmdInputs_.addDropDownCommandInput(_DROPDOWN_INPUT_ID_STANDARD, 'Units', adsk.core.DropDownStyles.TextListDropDownStyle)
            if _standardSystem == _SYSTEM_ENGLISH:
                _standardDropDownInput.listItems.add(_SYSTEM_ENGLISH_ITEM_NAME, True)
                _standardDropDownInput.listItems.add(_SYSTEM_METRIC_ITEM_NAME, False)
            else:
                _standardDropDownInput.listItems.add(_SYSTEM_ENGLISH_ITEM_NAME, False)
                _standardDropDownInput.listItems.add(_SYSTEM_METRIC_ITEM_NAME, True)
            
            _sketchSelectionInput = cmdInputs_.addSelectionInput(_SELECTION_INPUT_ID_SKETCH, 'Sketch Selection', 'Select a sketch to place the Voronoi')
            _sketchSelectionInput.addSelectionFilter('Sketches')
            _sketchSelectionInput.setSelectionLimits(0,1)

            _constructionPlaneDropDownInput = cmdInputs_.addDropDownCommandInput(_DROPDOWN_INPUT_ID_CONSTRUCTION_PLANE, 'Construction Plane', adsk.core.DropDownStyles.TextListDropDownStyle)
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_XY, (_constructionPlane == _CONSTRUCTION_PLANE_XY))
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_XZ, (_constructionPlane == _CONSTRUCTION_PLANE_XZ))
            _constructionPlaneDropDownInput.listItems.add(_CONSTRUCTION_PLANE_YZ, (_constructionPlane == _CONSTRUCTION_PLANE_YZ))
            
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
            global _selectedSketchName

            htmlArgs = adsk.core.HTMLEventArgs.cast(args)            
            data = json.loads(htmlArgs.data)

            # This handler can receive the return value from the JS fusionJavaScriptHandler() call.
            # If the action value isn't present then ignore this call.
            if data == '' or not 'action' in data:
                return ()
            
            theAction = data['action']
            theArgs = data['arguments']

            # Sent when the palette has been loaded and initialized
            if theAction == 'started':

                # Return information to the palette. This can then be handled by the palette JS code
                # NOTE: This isn't working.  On the JS side the value is a Promise object???
                #htmlArgs.returnData = '{{"sketchName": "{0}","units": "{1}"}}'.format(_selectedSketchName, _units)

                # Send information to the palette. This will trigger an event in the javascript
                # within the html so that it can be handled.
                # HACK: We are doing this here and not in create above since the msg never is
                # received by the browser that first time.
                palette = _ui.palettes.itemById(_PALETTE_ID)
                if palette:
                    jsonDataStr = '{{"sketchName": "{0}","units": "{1}"}}'.format(_selectedSketchName, _units)
                    palette.sendInfoToHTML('init', jsonDataStr)

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

                    sketchNameStr = theArgs['sketchName']
                    svgStr = unquote(theArgs['svg'])
                    svgWidth = float(theArgs['width'] or 15)
                    svgHeight = float(theArgs['height'] or 10)

                    # Save the SVG to a temp file            
                    fp = tempfile.NamedTemporaryFile(mode='w', suffix='.svg', delete=False)
                    fp.writelines(svgStr)
                    fp.close()
                    svgFilePath = fp.name
                    print ("Generated temporary SVG file: " + svgFilePath)

                    # Either an existing sketch has been selected in the dialog or the
                    # user has specified the name in the Voronoi editor.  This can be
                    # either an existing sketch name or a new name to indicate to
                    # create a new sketch.
                    if sketchNameStr != None and sketchNameStr != '':
                        if _selectedSketchName != sketchNameStr:
                            _selectedSketchName = sketchNameStr    # use this sketch (might need to create)

                    # Get the specified sketch or create one if none found
                    design = _app.activeProduct
                    rootComp = design.rootComponent

                    theSketch = None

                    if _selectedSketchName != '':
                        theSketch = rootComp.sketches.itemByName(_selectedSketchName)
                    
                    if theSketch == None:
                        # Which plane if no sketch?
                        # xYConstructionPlane, xZConstructionPlane, yZConstructionPlane
                        plane = rootComp.xYConstructionPlane
                        if _constructionPlane == _CONSTRUCTION_PLANE_XZ:
                            plane = rootComp.xZConstructionPlane
                        elif _constructionPlane == _CONSTRUCTION_PLANE_YZ:
                            plane = rootComp.yZConstructionPlane

                        theSketch = rootComp.sketches.add(plane)

                        _selectedSketchName = "Voronoi - " + theSketch.name
                        theSketch.name = _selectedSketchName

                    theSketch.isComputeDeferred = True  # Help to speed up import

                    # Pos of import needs to be shifted up since SVG uses Y+ downward and F360 is Y+ upward.
                    # Another oddity is that Fusion uses Y+ downard for positioning of SVG.  Therefore, we
                    # need to negate the shift to move upward.
                    # DEFECT: API call below is not honoring the xpos, ypos values.

                    # import the temp svg file into the sketch.
                    retValue = theSketch.importSVG(svgFilePath, 0, svgHeight, 1)    # (filePath, xPos, yPos, scale)

                    # HACK: The importSVG() call is not honoring the yPos param.  Manually shift
                    # the sketch here so it's in the correct location.
                    moveSketch(theSketch, 0, svgHeight, 0)

                    theSketch.isComputeDeferred = False

        except:
            if _ui:
                _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))


def run(context):
    try:
        global _ui, _app
        _app = adsk.core.Application.get()
        _ui  = _app.userInterface

        # Add a command that displays the panel.
        createVoronoiCmdDef = _ui.commandDefinitions.itemById(_CREATE_VORONOI_CMD_ID)
        if not createVoronoiCmdDef:
            createVoronoiCmdDef = _ui.commandDefinitions.addButtonDefinition(_CREATE_VORONOI_CMD_ID, 'Create Voronoi', 'Generates a voronoi sketch\n', './/resources')
            createVoronoiCmdDef.toolClipFilename = './/resources//voronoi-tooltip.png'
            
            # Connect to Command Created event.
            onCommandCreated = VoronoiCommandCreatedHandler()
            createVoronoiCmdDef.commandCreated.add(onCommandCreated)
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
            _ui.messageBox('The "Create Voronoi" command has been added\nto the CREATE panel dropdown of the MODEL workspace.\n\nTo run the command, select the CREATE dropdown\nthen select "Create Voronoi".')
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
    except:
        if _ui:
            _ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))