# Native pixel output only. Bend scene order remains the presentation authority.
import Base
import ./Font.bend as F

def rasterize(rectangles: List<&2, F.Rect>) -> IO(Image):
  import "./DefenseRaster.c"
  import "./DefenseRaster.js"
