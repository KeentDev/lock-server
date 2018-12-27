### Server API Urls

List of root API routes:
  * User
  * Locker



# User

Path: `/user`  
List of `user` APIs:
  * Sign in
  * Sign out
  * User profile look-up
  * Rental information 

___


## Sign in

Method: `GET`  
Path: `/sign-in`

Authenticates user logon session on Web and Mobile app.

Payload: 
  * `student_id`: Student ID of the student
    * 7 numeric digits
  * `password`: Password of the student
    * Alphanumeric characters
    * minimum of 6 characters

Returns:

JWT Token: _soon_

___

## Sign out

Method: `POST`  
Path: `/sign-out`

Logs the user out of a session from either Web or Mobile app.

Payload: N/A

___

## User profile look-up

Method: `GET`  
Path: `/profile`

Fetch a user's personal profile

Payload: 
  * `student_id`: Student ID of the student
    * 7 numeric digits
  * Auth token. _Soon_.

Returns:  
  * `first_name` 
  * `last_name`
  * `id_num`
  * `gender`
  * `email_addr`
  * `course_section`

___

## Rental information

Method: `GET`  
Path: `/rental-info`

Fetch a user's rental information.

Payload: 
  * `student_id`: Student ID of the student
    * 7 numeric digits
  * Auth token. _Soon_.

Returns:  
  * `start_time` 
  * `duration`
  * `unit_id`
  * `amount`

___

# Locker

Path: `/locker`
List of APIs:
  * Unit list
  * Area list
  * Locker availability
  * Acquire locker unit

---

## Unit list

Method: `GET`  
Path: `/unit-list`

Fetch paginated locker units list.

Payload: 
  * `area_id`: ID of the Locker area.
  * Auth token. _Soon_.

Returns:  
  * `locker_id`
  * `locker_mode`  
    * modes (_one of the f.f._):
      * `on-rent`
      * `reserved`
      * `available`

---
## Area list

Method: `GET`  
Path: `/area-list`

Fetch paginated area list.

Payload: _N/A_
  * Auth token. _Soon_.

Returns:  
  * `location`
    * `number`
    * `place`
  * `avail_lockers_no`
  * `area_id`

---

## Unit rental authorization

Method: `GET`  
Path: `/transaction/auth`

Checks unit's status for rental/reserve transaction.  

Payload:
  * `unit_id`
  * `user_id`
  * Auth token. _Soon_.

Returns:
  * `activity_log_id`
  * `authorized`: boolean
  * `api_msg_code`
    * `1` - Locker unit is not available (_reserved_/_occupied_)
    * `2` - User is not authorized to rent/reserve (_User has existing rental/reserved unit_)



---

## Rental transaction

Method: `POST`  
Path: `/transaction/feed`

Updates server the user's transaction amount feed through coin feeder for rental transaction (_Rent/Extend_). 

Payload:
  * `auth_activity_log_id` (_Activity log ID of rental authorization_)
  * `transaction_amount`
  * Auth token. _Soon_.

Returns:  
  * `transaction_id`
  * `success`: boolean

---

## Acquire rental unit

Method: `POST`  
Path: `/transaction/rent`

Enables user to acquire the specified rental unit.  
>Client must be authorized to rent the unit using `/auth`

Payload:
  * `student_id`
  * `acquire_type`
  * `auth_activity_log_id`
  * `transaction_amount`
  * Auth token. _Soon_.

Returns:  
  * `activity_log_id`
  * `success`: boolean