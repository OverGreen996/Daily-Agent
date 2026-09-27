import {LightPerception} from '../idle/LightPerception.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Explicit diagnostic: one current-window capture; no screenshot or OCR text persisted.
const perception=new LightPerception();
const result=await perception.observe({process:'diagnostic-foreground'},{force:true});
assert.equal(result.width,640);assert.equal(result.height,360);assert.ok(result.text.length>0);
assert.equal((await perception.observe({process:'diagnostic-foreground'},{force:true})).skipped,true);
const report={passed:true,width:result.width,height:result.height,textCharacters:result.text.length,cooldown:true,rawCaptureSaved:false,ocrTextSaved:false,contentAccuracy:'Not asserted for live window; controlled Chinese/English OCR fixtures run in tests/ocr.test.js'};
fs.writeFileSync('test-output/perception-report.json',JSON.stringify(report,null,2));console.log(report);
