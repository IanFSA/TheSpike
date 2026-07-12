import type{TrafficIncident,TrafficReport,TrafficWorkspace}from"@/app/types/traffic";

const now=Date.now(),iso=(minutesAgo:number)=>new Date(now-minutesAgo*60_000).toISOString();
function incident(id:string,roadName:string,heading:string,location:string,roadCrossing:string,incidentType:string,description:string,priority:number,minutesAgo:number,sourceName="TrafficSA",source:"api"|"listener"="api",verified=true):TrafficIncident{return{id,fingerprint:`mock-${id}`,source,sourceName,incidentType,description,roadName,roadCrossing,location,region:"GAUTENG",heading,sourceCreatedAt:iso(minutesAgo+8),sourceModifiedAt:iso(minutesAgo),receivedAt:iso(minutesAgo+6),lastSeenAt:iso(2),listenerName:source==="listener"?"Local preview listener":undefined,verified,expiresAt:source==="listener"?iso(-60):undefined,priority,severity:priority>=85?"critical":priority>=65?"major":"routine",status:minutesAgo<10?"updated":"active"}}

const incidents:TrafficIncident[]=[
 incident("mock-n1-allandale","N1","Northbound","Midrand","Allandale Road","Crash","A multi-vehicle crash near the Allandale Road interchange is blocking two right lanes, with a lengthy queue extending back through the Midrand business district.",100,12,"SANRAL"),
 incident("mock-m1-empire","M1","Southbound","Johannesburg","Empire Road","Congestion","Heavy slow-moving traffic is building from the Empire Road interchange toward the Crown interchange after an earlier obstruction was cleared.",72,18,"TrafficSA"),
 incident("mock-n3-geldenhuys","N3","Northbound","Germiston","Geldenhuys interchange","Road closed","The left-hand collector lane at the Geldenhuys interchange remains closed while emergency teams attend to a truck that lost part of its load.",94,26,"SANRAL"),
 incident("mock-n12-gilloolys","N12","Eastbound","Bedfordview","Gillooly's interchange","Crash","A crash on the eastbound carriageway approaching Gillooly's is causing stop-start traffic and delays through the interchange.",88,33,"TrafficSA"),
 incident("mock-r21-pomona","R21","Southbound","Kempton Park","Pomona Road","Obstruction","Debris is obstructing the middle lane near Pomona Road; motorists are moving through on either side with traffic slowing on the approach.",82,9,"SANRAL"),
 incident("mock-n14-jean","N14","Westbound","Centurion","Jean Avenue","Congestion","Traffic is moving slowly from the Jean Avenue interchange toward the Brakfontein interchange during the afternoon peak.",45,42,"TrafficSA"),
 incident("mock-n1-rivonia","N1","Southbound","Sandton","Rivonia Road","Broken-down truck","A broken-down heavy vehicle is partly blocking the slow lane just after Rivonia Road, creating a growing queue toward the Buccleuch interchange.",78,21,"SANRAL"),
 incident("mock-m1-woodmead","M1","Northbound","Woodmead","Woodmead Drive","Roadworks","Emergency surface repairs have reduced the motorway to two lanes near Woodmead Drive, with intermittent queuing through the work zone.",58,48,"TrafficSA"),
 incident("mock-listener-verified","N3","Southbound","Alberton","Heidelberg Road","Crash","A verified listener reports that one lane is blocked after a two-car crash near Heidelberg Road; vehicles are passing slowly in the remaining lanes.",86,14,"Listener","listener",true),
 incident("mock-listener-unverified","N12","Westbound","Benoni","Tom Jones Street","Hazard","An unverified listener reports a large object in the centre lane near the Tom Jones Street interchange. This has not been independently confirmed.",70,7,"Listener","listener",false),
 incident("mock-r21-airport","R21","Northbound","OR Tambo","Atlas Road","Congestion","Long queues are reported on the approach to the airport precinct, with traffic especially slow between Atlas Road and the terminal split.",66,29,"TrafficSA"),
 incident("mock-n3-buccleuch","N3","Southbound","Buccleuch","Buccleuch interchange","Stationary vehicle","A stationary vehicle is on the shoulder after the Buccleuch interchange and is not currently obstructing a live lane.",35,16,"SANRAL")
];

function report(id:string,status:"draft"|"published",createdAt:string,bulletin:string):TrafficReport{return{id,version:20260712001,headline:"Major delays on the N1 and N3",bulletin,natashaHeadline:"A multi-vehicle crash is blocking two lanes on the N1 northbound near Allandale Road, while a truck obstruction is keeping part of the N3 Geldenhuys interchange closed.",closer:"",incidentIds:incidents.slice(0,7).map(item=>item.id),createdAt,sourceCheckedAt:iso(4),generatedBy:"openai",generationKind:"manual",status,manuallyEdited:status==="draft",publishedAt:status==="published"?createdAt:null,publishedBy:status==="published"?"Preview producer":null,model:"gpt-5.4-mini (mock)",inputTokens:816,outputTokens:173,totalTokens:989,generationMs:1842,errorMessage:null,readAt:null,readBy:null}}

const bulletin=`On the N1 northbound, a multi-vehicle crash near Allandale Road is blocking two right lanes, with delays building through Midrand.

The collector lane on the N3 northbound at Geldenhuys remains closed while crews clear a truck obstruction.

On the N12 eastbound, a crash approaching Gillooly's is causing stop-start traffic through Bedfordview.

Debris is blocking the middle lane of the R21 southbound near Pomona Road, while the N1 southbound is slow past a broken-down truck near Rivonia Road.

The M1 southbound is also heavily congested from Empire Road toward Crown interchange.`;

export const mockTrafficWorkspace:TrafficWorkspace={authenticated:true,draft:report("mock-current-draft","draft",iso(8),bulletin),published:report("mock-published","published",iso(36),"Earlier this afternoon, delays were concentrated on the N1 through Midrand and the N3 near Germiston."),updatedDraft:report("mock-updated-draft","draft",iso(3),bulletin),latestTest:{...report("mock-test","draft",iso(5),bulletin),generationKind:"test",status:"draft",manuallyEdited:false},snapshot:{id:"mock-snapshot",checkedAt:iso(4),incidentCount:incidents.length,meaningfulChanges:3,incidents},lastRead:{reportId:"mock-published",readAt:iso(17)},pendingGeneration:true,pendingChangeCount:3,pendingSince:iso(6),lastSuccessfulCheckAt:iso(4),lastCheckError:"Mock TrafficSA timeout retained for diagnostics and layout testing",lastCheckErrorAt:iso(24),lastGenerationError:"Mock OpenAI response validation failure retained for diagnostics",lastGenerationErrorAt:iso(19)};

