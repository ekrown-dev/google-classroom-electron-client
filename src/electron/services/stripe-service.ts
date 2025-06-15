import Stripe from 'stripe';
import log from 'electron-log';

interface SubscriptionStatus {
  isActive: boolean;
  subscriptionId?: string;
  customerId?: string;
  planName?: string;
  status?: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: Date;
  error?: string;
}

interface CheckoutSessionResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}

export class StripeService {
  private stripe: Stripe;
  private readonly webhookSecret: string;

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!stripeSecretKey) {
      throw new Error('Missing Stripe configuration. Please set STRIPE_SECRET_KEY environment variable.');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });

    log.info('Stripe service initialized');
  }

  async createCheckoutSession(priceId: string, userId: string, customerId?: string, customerEmail?: string): Promise<CheckoutSessionResult> {
    try {
      log.info('Creating Stripe checkout session for price:', priceId, 'User ID (for client_reference_id):', userId, 'Customer ID:', customerId, 'Customer Email:', customerEmail);

      if (!userId) {
        log.error('User ID is required to create a Stripe checkout session for client_reference_id.');
        return {
          success: false,
          error: 'User ID is required.'
        };
      }

      const planName = await this.getPlanName(priceId);

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        success_url: `${process.env.MCP_SERVER_URL || 'https://mcp.ekrown.com'}/payment-success.html`,
        cancel_url: `${process.env.MCP_SERVER_URL || 'https://mcp.ekrown.com'}/payment-cancelled.html`,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        metadata: {
          source: 'google-classroom-mcp-desktop',
          userId: userId,
          plan: planName
        },
        client_reference_id: userId
      };

      if (customerId) {
        sessionParams.customer = customerId;
      } else {
        if (customerEmail) {
          sessionParams.customer_email = customerEmail;
        }
      }

      const session = await this.stripe.checkout.sessions.create(sessionParams);

      log.info('Checkout session created successfully:', session.id);

      return {
        success: true,
        url: session.url!,
        sessionId: session.id
      };
    } catch (error: any) {
      log.error('Error creating checkout session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSubscriptionStatus(customerId?: string): Promise<SubscriptionStatus> {
    try {
      if (!customerId) {
        return {
          isActive: false,
          error: 'Customer ID not provided'
        };
      }

      log.info('Getting subscription status for customer:', customerId);

      // Get customer's subscriptions
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10
      });

      if (subscriptions.data.length === 0) {
        return {
          isActive: false,
          customerId,
          error: 'No subscriptions found for customer'
        };
      }

      // Get the most recent active subscription
      const activeSubscription = subscriptions.data.find(sub => 
        sub.status === 'active' || sub.status === 'trialing'
      ) || subscriptions.data[0];

      const isActive = activeSubscription.status === 'active' || activeSubscription.status === 'trialing';

      // Get price information
      let planName = 'Unknown Plan';
      if (activeSubscription.items.data.length > 0) {
        const priceId = activeSubscription.items.data[0].price.id;
        planName = await this.getPlanName(priceId);
      }

      return {
        isActive,
        subscriptionId: activeSubscription.id,
        customerId,
        planName,
        status: activeSubscription.status,
        currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
        trialEnd: activeSubscription.trial_end ? new Date(activeSubscription.trial_end * 1000) : undefined
      };
    } catch (error: any) {
      log.error('Error getting subscription status:', error);
      return {
        isActive: false,
        customerId,
        error: error.message
      };
    }
  }

  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('Canceling subscription:', subscriptionId, 'immediately:', immediately);

      if (immediately) {
        await this.stripe.subscriptions.cancel(subscriptionId);
        log.info('Subscription canceled immediately');
      } else {
        await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
        log.info('Subscription scheduled for cancellation at period end');
      }

      return { success: true };
    } catch (error: any) {
      log.error('Error canceling subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async reactivateSubscription(subscriptionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('Reactivating subscription:', subscriptionId);

      await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });

      log.info('Subscription reactivated successfully');
      return { success: true };
    } catch (error: any) {
      log.error('Error reactivating subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createCustomer(email: string, name?: string): Promise<{ success: boolean; customerId?: string; error?: string }> {
    try {
      log.info('Creating Stripe customer for email:', email);

      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          source: 'google-classroom-mcp-desktop'
        }
      });

      log.info('Customer created successfully:', customer.id);

      return {
        success: true,
        customerId: customer.id
      };
    } catch (error: any) {
      log.error('Error creating customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getCustomerByEmail(email: string): Promise<{ success: boolean; customerId?: string; error?: string }> {
    try {
      log.info('Finding customer by email:', email);

      const customers = await this.stripe.customers.list({
        email: email,
        limit: 1
      });

      if (customers.data.length === 0) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      return {
        success: true,
        customerId: customers.data[0].id
      };
    } catch (error: any) {
      log.error('Error finding customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleWebhook(payload: string, signature: string): Promise<{ success: boolean; event?: Stripe.Event; error?: string }> {
    try {
      if (!this.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

      log.info('Webhook event received:', event.type, event.id);

      // Handle different event types
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionEvent(event);
          break;
        
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
          await this.handleInvoiceEvent(event);
          break;
        
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event);
          break;
        
        default:
          log.info('Unhandled webhook event type:', event.type);
      }

      return {
        success: true,
        event
      };
    } catch (error: any) {
      log.error('Error handling webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    
    log.info('Handling subscription event:', event.type, subscription.id);
    
    // Here you would typically update your database
    // For this implementation, we'll just log the event
    // In a real app, you'd update the user's license status in Supabase
    
    const status = subscription.status;
    const customerId = subscription.customer as string;
    
    log.info('Subscription status changed:', {
      subscriptionId: subscription.id,
      customerId,
      status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  }

  private async handleInvoiceEvent(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    
    log.info('Handling invoice event:', event.type, invoice.id);
    
    if (event.type === 'invoice.payment_failed') {
      log.warn('Payment failed for invoice:', invoice.id);
      // Handle failed payment (notify user, update license status, etc.)
    } else if (event.type === 'invoice.payment_succeeded') {
      log.info('Payment succeeded for invoice:', invoice.id);
      // Handle successful payment (extend license, send confirmation, etc.)
    }
  }

  private async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    
    log.info('Checkout session completed:', session.id);
    
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;
    const clientReferenceId = session.client_reference_id; // This is the Supabase user ID
    
    log.info('New subscription created:', {
      sessionId: session.id,
      customerId,
      subscriptionId,
      clientReferenceId
    });

    // Return the data so it can be processed by the main process
    if (clientReferenceId && subscriptionId && customerId) {
      this.pendingWebhookUpdate = {
        userId: clientReferenceId,
        subscriptionId,
        customerId,
        status: 'active'
      };
    }
  }

  // Property to store pending webhook updates
  private pendingWebhookUpdate: {
    userId: string;
    subscriptionId: string;
    customerId: string;
    status: string;
  } | null = null;

  // Method to get and clear pending webhook update
  getPendingWebhookUpdate(): {
    userId: string;
    subscriptionId: string;
    customerId: string;
    status: string;
  } | null {
    const update = this.pendingWebhookUpdate;
    this.pendingWebhookUpdate = null;
    return update;
  }

  private async getPlanName(priceId: string): Promise<string> {
    try {
      const price = await this.stripe.prices.retrieve(priceId, {
        expand: ['product']
      });

      const product = price.product as Stripe.Product;
      return product.name || 'Unknown Plan';
    } catch (error) {
      log.error('Error getting plan name:', error);
      return 'Unknown Plan';
    }
  }

  async getAvailablePlans(): Promise<{ success: boolean; plans?: any[]; error?: string }> {
    try {
      // Get all products with their prices
      const products = await this.stripe.products.list({
        active: true,
        limit: 100
      });

      const plans = [];

      for (const product of products.data) {
        const prices = await this.stripe.prices.list({
          product: product.id,
          active: true
        });

        if (prices.data.length > 0) {
          plans.push({
            id: product.id,
            name: product.name,
            description: product.description,
            prices: prices.data.map(price => ({
              id: price.id,
              amount: price.unit_amount,
              currency: price.currency,
              interval: price.recurring?.interval,
              intervalCount: price.recurring?.interval_count
            }))
          });
        }
      }

      return {
        success: true,
        plans
      };
    } catch (error: any) {
      log.error('Error getting available plans:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
} 