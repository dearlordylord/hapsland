# Host IO only. Ordered controls and fixed ticks replay through the actual Host.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M

type Entry is Data:
  Entry{kind: U32, a: U32, b: U32}

def bytes(+value: U32) -> List<&2,U32>:
  [(value .&. 255 : U32),((value >> 8n) .&. 255 : U32),((value >> 16n) .&. 255 : U32),(value >> 24n : U32)]
def encode(entry: Entry) -> List<&2,U32>:
  match entry:
    case Entry{kind,a,b}: List.append(&2,U32,bytes(kind),List.append(&2,U32,bytes(a),bytes(b)))
def word(a: U32,b: U32,c: U32,d: U32) -> U32:
  (a .|. (b << 8n) .|. (c << 16n) .|. (d << 24n) : U32)
def decode(items: List<&2,U32>) -> Maybe<&2,Entry>:
  match items:
    case a <> b <> c <> d <> e <> f <> g <> h <> i <> j <> k <> l <> Nil{}:
      Some{Entry{word(a,b,c,d),word(e,f,g,h),word(i,j,k,l)}}
    case _: None{}
def ticks(fuel: Nat,world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: ticks(n,H.tick(world))
def apply(world: M.World,entry: Entry) -> M.World:
  match entry:
    case Entry{0,a,_}: H.reset_layout(a)
    case Entry{1,a,_}: H.key(world,a)
    case Entry{2,a,b}: H.click(world,a,b)
    case Entry{3,a,b}: H.move(world,a,b)
    case Entry{4,a,_}: ticks(U32.to_nat(a),world)
    case _: world

def written(pair: File & Result<&1,&1,U32 & String,Unit>) -> IO(File):
  (file,result) = pair
  do IO<File>:
    Unit <- IO.try(Unit,IO.pure(Result<&1,&1,U32 & String,Unit>,result))
    return file
def append(file: File,entry: Entry) -> IO(File):
  IO.bind(File & Result<&1,&1,U32 & String,Unit>,File,File.write_bytes(file,encode(entry)),written)
def header_written(pair: File & Result<&1,&1,U32 & String,Unit>,layout: U32) -> IO(File):
  IO.bind(File,File,written(pair),file => append(file,Entry{0,layout,0}))
def create(path: String,header: String,layout: U32) -> IO(File):
  do IO<File>:
    file : File <- IO.try(File,File.open(path,"w"))
    pair : File & Result<&1,&1,U32 & String,Unit> <- File.write(file,header)
    header_written(pair,layout)
def reset(file: File,path: String,header: String,layout: U32) -> IO(File):
  do IO<File>:
    File.close(file)
    create(path,header,layout)

def read_pair(pair: File & Result<&1,&1,U32 & String,List<&2,U32>>) -> IO(File & Maybe<&2,Entry>):
  (file,result) = pair
  do IO<File & Maybe<&2,Entry>>:
    items : List<&2,U32> <- IO.try(List<&2,U32>,IO.pure(Result<&1,&1,U32 & String,List<&2,U32>>,result))
    return (file,decode(items))
def read(file: File) -> IO(File & Maybe<&2,Entry>):
  IO.bind(File & Result<&1,&1,U32 & String,List<&2,U32>>,File & Maybe<&2,Entry>,File.read_bytes(file,12),read_pair)
def header_checked(valid: Bool,file: File) -> IO(File):
  match valid:
    case True{}: IO.pure(File,file)
    case False{}: IO.die(File,1,"Saved game header changed; recording was not opened for writing")
def header_read(pair: File & Result<&1,&1,U32 & String,String>,header: String) -> IO(File):
  (file,result) = pair
  do IO<File>:
    actual : String <- IO.try(String,IO.pure(Result<&1,&1,U32 & String,String>,result))
    header_checked(String.eq(actual,header),file)
def open_read(path: String,header: String) -> IO(File):
  do IO<File>:
    file : File <- IO.try(File,File.open(path,"r"))
    pair : File & Result<&1,&1,U32 & String,String> <- File.read(file,80)
    header_read(pair,header)
def restore_step(next: File & Maybe<&2,Entry>,world: M.World,rest: File -> M.World -> IO(File & M.World)) -> IO(File & M.World):
  match next:
    case (file,None{}): IO.pure(File & M.World,(file,world))
    case (file,Some{entry}): rest(file,apply(world,entry))
def restore(fuel: Nat,file: File,world: M.World) -> IO(File & M.World):
  match fuel:
    case 0n: IO.die(File & M.World,1,"Saved game exceeds restore limit")
    case 1n+n:
      IO.bind(File & Maybe<&2,Entry>,File & M.World,read(file),next => restore_step(next,world,f => w => restore(n,f,w)))
def restored(pair: File & M.World,path: String) -> IO(File & M.World):
  (file,world) = pair
  do IO<File & M.World>:
    File.close(file)
    writable : File <- IO.try(File,File.open(path,"a"))
    return (writable,world)
def resume(+path: String,header: String) -> IO(File & M.World):
  do IO<File & M.World>:
    file : File <- open_read(path,header)
    pair : File & M.World <- restore(4294967295n,file,H.initial())
    restored(pair,path)
