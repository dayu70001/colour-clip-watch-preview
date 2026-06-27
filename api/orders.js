import { requireAdmin } from "./_lib/auth.js";
import { addToSet, getJson, listJson, setJson, setMembers, storageError } from "./_lib/storage.js";

const ORDER_INDEX_KEY = "colour-clip-watch:orders:index";
const ORDER_KEY_PREFIX = "colour-clip-watch:orders:";
const STATUSES = new Set(["New", "Confirmed", "Pending Payment", "Paid", "Processing", "Shipped", "Completed", "Cancelled"]);

function orderKey(orderNumber) {
  return `${ORDER_KEY_PREFIX}${orderNumber}`;
}

function totalQuantity(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const order = req.body?.order;

      if (!order?.orderNumber) {
        return res.status(400).json({ error: "Missing order number" });
      }

      const savedOrder = {
        ...order,
        status: order.status || "New",
        createdAt: order.createdAt || new Date().toISOString(),
        quantity: totalQuantity(order.items)
      };

      await setJson(orderKey(savedOrder.orderNumber), savedOrder);
      await addToSet(ORDER_INDEX_KEY, savedOrder.orderNumber);
      return res.status(200).json({ ok: true, order: savedOrder });
    }

    if (req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const orderNumbers = await setMembers(ORDER_INDEX_KEY);
      const orders = await listJson(orderNumbers.map(orderKey));
      orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return res.status(200).json({ orders });
    }

    if (req.method === "PATCH") {
      if (!requireAdmin(req, res)) return;
      const orderNumber = String(req.body?.orderNumber || "");
      const status = String(req.body?.status || "");

      if (!orderNumber || !STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid order status update" });
      }

      const order = await getJson(orderKey(orderNumber), null);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const updatedOrder = { ...order, status, updatedAt: new Date().toISOString() };
      await setJson(orderKey(orderNumber), updatedOrder);
      return res.status(200).json({ ok: true, order: updatedOrder });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || storageError() });
  }
}
