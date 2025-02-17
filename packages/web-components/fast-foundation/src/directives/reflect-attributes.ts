import {
    DOM,
    ExecutionContext,
    HTMLDirective,
    StatelessAttachedAttributeDirective,
    Subscriber,
    SubscriberSet,
    ViewBehaviorTargets,
} from "@microsoft/fast-element";
import type { CaptureType } from "@microsoft/fast-element";

const observer = new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
        AttributeReflectionSubscriptionSet.getOrCreateFor(
            mutation.target as HTMLElement
        ).notify(mutation.attributeName);
    }
});

class AttributeReflectionSubscriptionSet {
    private static subscriberCache: WeakMap<
        any,
        AttributeReflectionSubscriptionSet
    > = new WeakMap();

    private watchedAttributes: Set<Readonly<string[]>> = new Set();
    private subscribers = new SubscriberSet(this);

    constructor(public element: HTMLElement) {
        AttributeReflectionSubscriptionSet.subscriberCache.set(element, this);
    }

    public notify(attr: string | null) {
        this.subscribers.notify(attr);
    }

    public subscribe(subscriber: Subscriber & ReflectAttributesDirective) {
        this.subscribers.subscribe(subscriber);

        if (!this.watchedAttributes.has(subscriber.attributes)) {
            this.watchedAttributes.add(subscriber.attributes);
            this.observe();
        }
    }

    public unsubscribe(subscriber: Subscriber & ReflectAttributesDirective) {
        this.subscribers.unsubscribe(subscriber);

        if (this.watchedAttributes.has(subscriber.attributes)) {
            this.watchedAttributes.delete(subscriber.attributes);
            this.observe();
        }
    }

    private observe() {
        const attributeFilter: string[] = [];

        for (const attributes of this.watchedAttributes.values()) {
            for (let i = 0; i < attributes.length; i++) {
                attributeFilter.push(attributes[i]);
            }
        }

        observer.observe(this.element, { attributeFilter });
    }

    public static getOrCreateFor(source: HTMLElement) {
        return (
            this.subscriberCache.get(source) ||
            new AttributeReflectionSubscriptionSet(source)
        );
    }
}

class ReflectAttributesDirective extends StatelessAttachedAttributeDirective<string[]> {
    /**
     * The attributes the behavior is reflecting
     */
    public attributes: Readonly<string[]>;
    constructor(attributes: string[]) {
        super(attributes);
        this.attributes = Object.freeze(attributes);
    }

    public bind(
        source: HTMLElement,
        context: ExecutionContext,
        targets: ViewBehaviorTargets
    ): void {
        const subscription = AttributeReflectionSubscriptionSet.getOrCreateFor(source);
        subscription[this.id] = targets[this.nodeId];
        subscription.subscribe(this);

        // Reflect any existing attributes because MutationObserver will only
        // handle *changes* to attributes.
        if (source.hasAttributes()) {
            for (let i = 0; i < source.attributes.length; i++) {
                this.handleChange(subscription, source.attributes[i].name);
            }
        }
    }

    public unbind(source: any): void {
        AttributeReflectionSubscriptionSet.getOrCreateFor(source).unsubscribe(this);
    }

    public handleChange(source: AttributeReflectionSubscriptionSet, arg: string): void {
        // In cases where two or more ReflectAttrBehavior instances are bound to the same element,
        // they will share a Subscriber implementation. In that case, this handle change can be invoked with
        // attributes an instances doesn't need to reflect. This guards against reflecting attrs
        // that shouldn't be reflected.
        if (this.attributes.includes(arg)) {
            const element = source.element as HTMLElement;
            const target = source[this.id] as HTMLElement;
            DOM.setAttribute(target, arg, element.getAttribute(arg));
        }
    }
}

HTMLDirective.define(ReflectAttributesDirective);

/**
 * Reflects attributes from the host element to the target element of the directive.
 * @param attributes - The attributes to reflect
 *
 * @beta
 * @example
 * ```ts
 * const template = html`
 *     <button
 *         ${reflectAttributes("aria-label", "aria-describedby")}
 *     >
 *          hello world
 *     </button
 * `
 * ```
 */
export function reflectAttributes<T = any>(...attributes: string[]): CaptureType<T> {
    return new ReflectAttributesDirective(attributes);
}
