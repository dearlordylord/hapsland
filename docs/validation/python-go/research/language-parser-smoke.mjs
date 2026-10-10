// Synthetic syntax fixtures; copy into an isolated package directory to replay.
import Parser from "tree-sitter";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const fixtures=[
 ["tree-sitter-go","package payment\ntype Payment struct { Paid bool; Receipt *string }\n"],
 ["tree-sitter-python","from typing import TypedDict, NotRequired\nclass Payment(TypedDict):\n    paid: bool\n    receipt: NotRequired[str]\n"],
 ["tree-sitter-c-sharp","public record Payment(bool Paid, string? Receipt);"],
 ["tree-sitter-java","sealed interface Payment permits Pending, Paid {} record Pending() implements Payment {} record Paid(String receipt) implements Payment {}"]
];
const outcomes=[];
for(const [name,source] of fixtures){
 try{const grammar=(await import(name)).default;const parser=new Parser();parser.setLanguage(grammar);const tree=parser.parse(source);outcomes.push({name,version:require(name+"/package.json").version,hasError:tree.rootNode.hasError,root:tree.rootNode.toString(),status:"parsed"});}
 catch(error){outcomes.push({name,status:"failed",error:error.message});}
}
const result={node:process.version,platform:process.platform,arch:process.arch,runtime:require("tree-sitter/package.json").version,scope:"one valid syntax fixture per grammar, Node only, no Hapsland adapter or Bun packaging",outcomes};
console.log(JSON.stringify(result,null,2));

if (outcomes.some(outcome => outcome.status !== "parsed" || outcome.hasError)) process.exitCode = 1;
