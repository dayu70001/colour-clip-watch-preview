import { requireAdmin } from "./_lib/auth.js";
import { addToSet, deleteKey, getJson, listJson, removeFromSet, setJson, setMembers, storageError } from "./_lib/storage.js";

const ORDER_INDEX_KEY = "colour-clip-watch:orders:index";
const ORDER_KEY_PREFIX = "colour-clip-watch:orders:";
const STATUSES = new Set(["New", "Confirmed", "Pending Payment", "Paid", "Processing", "Shipped", "Completed", "Cancelled"]);

function orderKey(orderNumber) {
  return `${ORDER_KEY_PREFIX}${orderNumber}`;
}

function totalQuantity(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function present(value) {
  return typeof value === "string" ? value.trim().length > 0 : value != null && String(value).trim().length > 0;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function validateOrder(order) {
  const details = [];

  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return ["order required"];
  }

  if (!present(order.orderNumber)) details.push("orderNumber required");

  if (!Array.isArray(order.items) || !order.items.length) {
    details.push("items required");
  } else {
    order.items.forEach((item, index) => {
      const name = item?.name || item?.title || item?.productName;
      const quantity = item?.qty ?? item?.quantity;
      const price = item?.price ?? item?.unitPrice;

      if (!present(name)) details.push(`items.${index}.name required`);
      if (!positiveNumber(quantity)) details.push(`items.${index}.quantity invalid`);
      if (!positiveNumber(price)) details.push(`items.${index}.price invalid`);
    });
  }

  if (!present(order.customer?.fullName)) details.push("customer.fullName required");
  if (!present(order.customer?.email)) details.push("customer.email required");
  if (!present(order.customer?.phone)) details.push("customer.phone required");
  if (!present(order.shipping?.address1)) details.push("shipping.address1 required");
  if (!present(order.shipping?.city)) details.push("shipping.city required");
  if (!present(order.shipping?.postcode)) details.push("shipping.postcode required");
  if (!present(order.shipping?.country)) details.push("shipping.country required");
  if (!present(order.paymentMethod)) details.push("paymentMethod required");
  if (!positiveNumber(order.subtotal)) details.push("subtotal invalid");
  if (!positiveNumber(order.total)) details.push("total invalid");
  if (positiveNumber(order.subtotal) && positiveNumber(order.total) && Number(order.total) < Number(order.subtotal)) {
    details.push("total must be greater than or equal to subtotal");
  }

  return details;
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const order = req.body?.order;
      const details = validateOrder(order);

      if (details.length) {
        return res.status(400).json({ error: "Invalid order", details });
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

    if (req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const orderNumber = String(req.body?.orderNumber || req.query?.orderNumber || "");

      if (!orderNumber) {
        return res.status(400).json({ error: "Missing order number" });
      }

      const order = await getJson(orderKey(orderNumber), null);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      await deleteKey(orderKey(orderNumber));
      await removeFromSet(ORDER_INDEX_KEY, orderNumber);
      return res.status(200).json({ ok: true, orderNumber });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || storageError() });
  }
}
