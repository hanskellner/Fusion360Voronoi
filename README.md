# Fusion360Voronoi

This script is used for generating voronoi sketches in [Autodesk Fusion 360](http://fusion360.autodesk.com/).  Once created, these sketches may then be used for creating or modifying models.

![Image of Voronoi Sample]
(./resources/Voronoi-128-Cells-Copper-sm.png)

## Installation

Copy the "Fusion360Voronoi" folder into your Fusion 360 "My Scripts" folder. You may find this folder using the following steps:

1. Start Fusion 360 and then select the File -> Scripts... menu item
2. The Scripts Manager dialog will appear and display the "My Scripts" folder and "Sample Scripts" folders
3. Select one of the "My Scripts" files and then click on the "+" Details icon near the bottom of the dialog.
  a. If there are no files in the "My Scripts" folder then create a default one.
  b. Click the Create button, select JavaScript, and then OK.
4. With the user script selected, click the Full Path "..." button to display a file explorer window that will display the "My Scripts" folder
5. Copy the Voronoi folder into this location

For example, on my Mac the folder is located in:

/Users/USERNAME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/Scripts

## Usage

1. Run the "Voronoi" script from the Script Manager
2. The settings dialog will be shown.  Adjust to your preferences:

  ![Image of Voronoi Settings](./resources/Voronoi%20Sketch%20Gen%20-%20Settings.png)

  - Edge Style: Straight or Curved edges
  - # Cells : Number of cells created in the sketch
  - Area Width : Width of the area filled with cells
  - Area Height : Height of the area filled with cells
  - % Scale Cell : Percentage to scale down each of the cells from default (~80%)
3. Click OK to generate the sketch

Note that a large number (> 128) of cells may take a while to generate (sometimes several minutes).

Once the voronoi sketch is created I will usually project the geometry onto a surface and then modify from there.  Or I'll use push/pull on the voronoi geometry to modify existing models. The image above was created using this method and a 128 cell voronoi pattern.

Examples posted on my [Fusion 360 project gallery](https://fusion360.autodesk.com/projects/voronoi-script).

## Issues

- One cell may not be filled after generation.  Adjusting a control point then forces it to fill.
- Large cell counts may cause a long generation time.
- It's not possible to adjust the spline's knots and strengths therefore the curves don't conform as close as they should.  The "% Scale Cell" value is a workaround for this.  Scaling down the cells reduces the possible overlap of the cells.

## Credits

This code makes use of the Raymond Hill's well done Javascript-Voronoi code:
https://github.com/gorhill/Javascript-Voronoi
