import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as cartService from './cart.service';
import { paramString } from '../../lib/params';

const GUEST_CART_COOKIE = 'cartSession';

/** Resolves the current cart owner: logged-in user id, or a guest session id
 *  persisted in a long-lived cookie. Creates the cookie on first use. */
function resolveOwner(req: Request, res: Response) {
  if (req.user) return { userID: req.user.id };
  let sessionID = req.cookies?.[GUEST_CART_COOKIE];
  if (!sessionID) {
    sessionID = randomUUID();
    res.cookie(GUEST_CART_COOKIE, sessionID, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }
  return { sessionID };
}

export async function getCartHandler(req: Request, res: Response) {
  const owner = resolveOwner(req, res);
  const cart = await cartService.getCart(owner);
  res.json(cart);
}

export async function addCartItemHandler(req: Request, res: Response) {
  const owner = resolveOwner(req, res);
  const item = await cartService.addItem(owner, req.body.variantId, req.body.quantity);
  res.status(201).json({ item });
}

export async function updateCartItemHandler(req: Request, res: Response) {
  const owner = resolveOwner(req, res);
  const item = await cartService.updateItem(owner, paramString(req.params.itemId), {
    quantity: req.body.quantity,
    variantId: req.body.variantId,
  });
  res.json({ item });
}

export async function removeCartItemHandler(req: Request, res: Response) {
  const owner = resolveOwner(req, res);
  await cartService.removeItem(owner, paramString(req.params.itemId));
  res.status(204).send();
}

export async function clearCartHandler(req: Request, res: Response) {
  const owner = resolveOwner(req, res);
  await cartService.clearCart(owner);
  res.status(204).send();
}
