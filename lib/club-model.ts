import {z} from "zod";
const text=z.string().trim().max(10000);const short=z.string().trim().max(200);const required=short.min(1,"This field is required");
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date (AD)").refine(v=>{const d=new Date(v+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v},"Choose a valid date");
const photo=z.string().max(200).refine(v=>!v||/^\/api\/images\/[a-f0-9-]+$/.test(v),"Please upload a photo").default("");
const common={sample:z.boolean().default(false)};
export const schemas={
 members:z.object({...common,memberId:required,name:required,photo,phone:short.default(""),address:short.default(""),position:z.enum(["President","Vice President","Secretary","Treasurer","Executive Member","Member"]),joiningDate:date,status:z.enum(["Active","Inactive"])}),
 meetings:z.object({...common,title:required,date,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),location:required,agenda:text.default(""),description:text.default(""),status:z.enum(["Upcoming","Completed","Cancelled"]),discussion:text.default(""),decisions:text.default(""),notes:text.default(""),nextDate:z.union([date,z.literal("")]).default(""),public:z.boolean().default(false)}),
 notices:z.object({...common,title:required,date,description:text.min(1),priority:z.enum(["Normal","Important","Urgent"]),public:z.boolean().default(false)}),
 transactions:z.object({...common,date,type:z.enum(["Income","Expense"]),category:required,amount:z.coerce.number().positive().max(1000000000).refine(v=>Math.abs(v*100-Math.round(v*100))<0.00001,"Use at most two decimal places"),description:required,source:required,receipt:short.default("")}),
 activities:z.object({...common,title:required,date,description:text.default(""),photo,status:z.enum(["Upcoming","Completed"]),public:z.boolean().default(false)}),
 gallery:z.object({...common,title:required,activity:short.default(""),date,caption:text.default(""),photo:photo.refine(v=>v.length>0,"Upload a photo"),public:z.boolean().default(false)}),
 settings:z.object({name:required,nepaliName:required,logo:photo,about:text,history:text,mission:text,objectives:text,address:short,phone:short,email:z.union([z.string().email(),z.literal("")]),established:short,facebook:z.union([z.string().url().startsWith("https://"),z.literal("")]),social:z.union([z.string().url().startsWith("https://"),z.literal("")]),adminEmails:z.array(z.string().email()).max(10)})
};
export type Kind=keyof typeof schemas;
export const kinds=Object.keys(schemas) as Kind[];
export const defaultSettings={name:"Karyabinayak Sanskriti Yuba Club",nepaliName:"कार्यबिनायक संस्कृति युवा क्लब",logo:"",about:"युवा सहभागिता, संस्कृति संरक्षण र सामाजिक सेवाका लागि एकजुट समुदाय।",history:"Placeholder: Add the story of how our club began.",mission:"Placeholder: Describe the club’s mission for the community.",objectives:"Placeholder: Add the club’s main objectives.",address:"Bhaisepati–25, Lalitpur",phone:"",email:"",established:"2083 BS",facebook:"",social:"",adminEmails:[]};
export const incomeCategories=["Membership Collection","Monthly Collection","Donation","Sponsorship","Fundraising","Other"];
export const expenseCategories=["Program Expense","Food","Printing","Sports","Equipment","Transportation","Other"];
export function money(v:number){return "NPR "+v.toLocaleString("en-NP",{maximumFractionDigits:2,minimumFractionDigits:0});}
export function dateLabel(v:string){if(!v)return "—";return new Date(v+"T12:00:00+05:45").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kathmandu"});}
export function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kathmandu",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export function totals(rows:any[]){const sum=(t:string)=>rows.filter(r=>!r.deleted&&r.type===t).reduce((s,r)=>s+Math.round(Number(r.amount)*100),0)/100;const income=sum("Income"),expense=sum("Expense");return {income,expense,balance:Math.round((income-expense)*100)/100};}
