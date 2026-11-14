use std::net::Ipv4Addr;

pub(super) fn local_ipv4() -> Vec<Ipv4Addr> {
    let mut addresses = interface_ipv4();
    // Keep the default route first when available. UDP connect only selects a
    // local source address here. No packet is sent and no gateway must answer.
    let preferred = std::net::UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|socket| {
            socket.connect((Ipv4Addr::new(192, 0, 2, 1), 9))?;
            socket.local_addr()
        })
        .ok()
        .and_then(|address| match address.ip() {
            std::net::IpAddr::V4(ip) => Some(ip),
            _ => None,
        });
    if let Some(ip) = preferred {
        addresses.retain(|address| *address != ip);
        addresses.insert(0, ip);
    }
    let mut seen = std::collections::HashSet::new();
    addresses.retain(|ip| seen.insert(*ip));
    addresses
}

#[cfg(unix)]
fn interface_ipv4() -> Vec<Ipv4Addr> {
    let mut first = std::ptr::null_mut();
    let mut addresses = Vec::new();
    // getifaddrs owns the linked list until freeifaddrs. sa_family determines
    // whether the associated address has the sockaddr_in layout.
    unsafe {
        if libc::getifaddrs(&mut first) != 0 {
            return addresses;
        }
        let mut current = first;
        while let Some(interface) = current.as_ref() {
            if interface.ifa_flags & (libc::IFF_UP as u32) != 0
                && interface
                    .ifa_addr
                    .as_ref()
                    .is_some_and(|address| address.sa_family as i32 == libc::AF_INET)
            {
                let address = &*interface.ifa_addr.cast::<libc::sockaddr_in>();
                addresses.push(Ipv4Addr::from(address.sin_addr.s_addr.to_ne_bytes()));
            }
            current = interface.ifa_next;
        }
        libc::freeifaddrs(first);
    }
    addresses
}

#[cfg(windows)]
fn interface_ipv4() -> Vec<Ipv4Addr> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER, GAA_FLAG_SKIP_MULTICAST,
        GetAdaptersAddresses, IP_ADAPTER_ADDRESSES_LH,
    };
    use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    use windows_sys::Win32::Networking::WinSock::{AF_INET, SOCKADDR_IN};
    let mut capacity = 15_000u32;
    let mut addresses = Vec::new();
    // u64 backing storage provides alignment for the adapter structs. The API
    // writes its linked lists into the buffer, so keep it alive during traversal.
    for _ in 0..3 {
        let mut storage = vec![0u64; (capacity as usize).div_ceil(8)];
        let first = storage.as_mut_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
        unsafe {
            let result = GetAdaptersAddresses(
                AF_INET.into(),
                GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER,
                std::ptr::null(),
                first,
                &mut capacity,
            );
            if result == 111 && capacity < 1_000_000 {
                continue; // ERROR_BUFFER_OVERFLOW supplies the required size.
            }
            if result != 0 {
                break;
            }
            let mut current = first;
            while let Some(adapter) = current.as_ref() {
                if adapter.OperStatus == IfOperStatusUp {
                    let mut next = adapter.FirstUnicastAddress;
                    while let Some(unicast) = next.as_ref() {
                        let socket = unicast.Address;
                        if socket.iSockaddrLength as usize >= size_of::<SOCKADDR_IN>()
                            && let Some(address) = socket.lpSockaddr.cast::<SOCKADDR_IN>().as_ref()
                            && address.sin_family == AF_INET
                        {
                            addresses
                                .push(Ipv4Addr::from(address.sin_addr.S_un.S_addr.to_ne_bytes()));
                        }
                        next = unicast.Next;
                    }
                }
                current = adapter.Next;
            }
        }
        break;
    }
    addresses
}
