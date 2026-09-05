import { describe, expect, it, vi } from "vitest";
import type { ServiceTitanClient } from "../../src/client.js";
import { loadInventoryDomain } from "../../src/domains/inventory/index.js";
import type { ToolDefinition, ToolRegistry } from "../../src/registry.js";

function setup() {
  const handlers = new Map<string, ToolDefinition["handler"]>();
  const registry = { register: (tool: ToolDefinition) => handlers.set(tool.name, tool.handler) } as unknown as ToolRegistry;
  const client = { get: vi.fn(), post: vi.fn(async()=>({ok:true})), patch: vi.fn(async()=>({ok:true})), delete: vi.fn() } as unknown as ServiceTitanClient;
  loadInventoryDomain(client, registry);
  const invoke = (name:string, args:unknown) => {
    const handler=handlers.get(name); if(!handler) throw new Error(`missing ${name}`); return handler(args);
  };
  return { client: client as any, invoke };
}

const address={street:"1 Main",unit:"",city:"Phoenix",state:"AZ",zip:"85001",country:"US"};
const alertSettings={sendEmailToTechnicianWhenPoMovedToSend:true,sendEmailToTechnicianWhenPoMovedToReceived:false,sendEmailToPmWhenPoMovedToSend:true,sendEmailToPmWhenPoMovedToReceived:false};

describe("inventory official request contracts",()=>{
  it("sends every required purchase-order create field with exact nested item names",async()=>{
    const {client,invoke}=setup();
    const body={vendorId:1,typeId:2,businessUnitId:3,inventoryLocationId:4,shipTo:{description:"Main",address},impactsTechnicianPayroll:true,date:"2026-09-01T00:00:00Z",requiredOn:"2026-09-02T00:00:00Z",tax:1.25,shipping:5,items:[{skuId:8,description:"Filter",vendorPartNumber:"VP-8",quantity:2,cost:9.5}]};
    await invoke("inventory_purchase_orders_create",body);
    expect(client.post).toHaveBeenCalledWith("/tenant/{tenant}/purchase-orders",body);
    await expect(invoke("inventory_purchase_orders_create",{...body,purchaseOrderTypeId:2})).rejects.toThrow();
  });

  it("requires and forwards the complete purchase-order-type settings",async()=>{
    const {client,invoke}=setup();
    const body={name:"Standard",active:true,includeInPoScreen:true,automaticallyReceive:false,displayToTechnician:true,excludeTaxFromJobCosting:false,impactToTechnicianPayroll:true,allowTechniciansToSendPo:true,defaultRequiredDateDaysOffset:2,skipWeekends:true,requireJobBeforeReceipt:false,includeInSalesTax:true,isDefault:false,copyPurchaseOrderItemsToInvoiceWhenReceived:false,isDefaultForConsignment:false,landedCostMethod:"ByValue",includeTaxInFullyLandedCost:true,preventJobDetachment:false,alertSettings};
    await invoke("inventory_purchase_order_types_create",body);
    expect(client.post).toHaveBeenCalledWith("/tenant/{tenant}/purchase-order-types",body);
    await expect(invoke("inventory_purchase_order_types_create",{name:"Incomplete"})).rejects.toThrow();
    await expect(invoke("inventory_purchase_order_types_create",{...body,landedCostMethod:"Average"})).rejects.toThrow();
  });

  it("uses official receipt and return create names without stripping required zero values",async()=>{
    const {client,invoke}=setup();
    const receipt={purchaseOrderId:1,dateReceived:"2026-09-01T12:00:00Z",tax:0,shipping:0,items:[{skuId:2,quantity:1,cost:0}]};
    const returned={vendorId:1,returnTypeId:2,businessUnitId:3,inventoryLocationId:4,returnDate:"2026-09-01T12:00:00Z",tax:0,shipping:0,restockingFee:0,items:[{skuId:2,quantity:1,cost:0}]};
    await invoke("inventory_receipts_create",receipt); await invoke("inventory_returns_create",returned);
    expect(client.post).toHaveBeenNthCalledWith(1,"/tenant/{tenant}/receipts",receipt);
    expect(client.post).toHaveBeenNthCalledWith(2,"/tenant/{tenant}/returns",returned);
  });

  it("requires official return-type and vendor fields and preserves delivery enum",async()=>{
    const {client,invoke}=setup();
    const returnType={name:"Vendor",automaticallyReceiveVendorCredit:true,includeInSalesTax:false,isDefault:false,isDefaultForConsignment:false};
    const vendor={name:"Supply Co",active:true,isTruckReplenishment:false,deliveryOption:"EmailAsPdf",taxRate:8.6,restrictedMobileCreation:true,address};
    await invoke("inventory_return_types_create",returnType); await invoke("inventory_vendors_create",vendor);
    expect(client.post).toHaveBeenNthCalledWith(1,"/tenant/{tenant}/return-types",returnType);
    expect(client.post).toHaveBeenNthCalledWith(2,"/tenant/{tenant}/vendors",vendor);
    await expect(invoke("inventory_vendors_create",{...vendor,deliveryOption:"CarrierPigeon"})).rejects.toThrow();
  });

  it("forwards batch custom-field operations instead of a legacy scalar map",async()=>{
    const {client,invoke}=setup();
    const body={operations:[{objectId:42,customFields:[{name:"Region",value:"West"}]}]};
    await invoke("inventory_receipts_update_custom_fields",body);
    await invoke("inventory_returns_update_custom_fields",body);
    await invoke("inventory_transfers_update_custom_fields",body);
    expect(client.patch).toHaveBeenNthCalledWith(1,"/tenant/{tenant}/receipts/custom-fields",body);
    expect(client.patch).toHaveBeenNthCalledWith(2,"/tenant/{tenant}/returns/custom-fields",body);
    expect(client.patch).toHaveBeenNthCalledWith(3,"/tenant/{tenant}/transfers/custom-fields",body);
  });

  it("preserves explicit nulls on updates and sends cancellation/rejection bodies",async()=>{
    const {client,invoke}=setup();
    await invoke("inventory_purchase_orders_update",{id:7,memo:"updated",jobId:22});
    await invoke("inventory_purchase_orders_cancel",{id:7,canceledReason:"Duplicate"});
    await invoke("inventory_purchase_orders_reject_request",{id:9,rejectionReason:"CostTooHigh"});
    expect(client.patch).toHaveBeenNthCalledWith(1,"/tenant/{tenant}/purchase-orders/7",{memo:"updated",jobId:22});
    expect(client.patch).toHaveBeenNthCalledWith(2,"/tenant/{tenant}/purchase-orders/7/cancellation",{canceledReason:"Duplicate"});
    expect(client.patch).toHaveBeenNthCalledWith(3,"/tenant/{tenant}/purchase-orders/requests/9/reject",{rejectionReason:"CostTooHigh"});
  });

  it("uses official transfer and warehouse update properties",async()=>{
    const {client,invoke}=setup();
    const externalData={applicationGuid:"12345678-1234-1234-1234-123456789012",patchMode:"Merge",externalData:[{key:"sync",value:null}]};
    await invoke("inventory_transfers_update",{id:5,transferFromId:1,transferToId:2,typeId:3,date:null,items:[{skuId:4,quantity:2}],externalData});
    await invoke("inventory_warehouses_update",{id:6,externalData});
    expect(client.patch.mock.calls[0][1]).toMatchObject({transferFromId:1,transferToId:2,typeId:3,date:null,externalData});
    expect(client.patch).toHaveBeenNthCalledWith(2,"/tenant/{tenant}/warehouses/6",{externalData});
    await expect(invoke("inventory_transfers_update",{id:5,fromLocationId:1})).rejects.toThrow();
  });
});
